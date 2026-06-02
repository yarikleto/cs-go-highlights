import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Box, Typography, Slider, IconButton, Stack, LinearProgress } from '@mui/material';
import {
  VolumeUp as VolumeIcon,
  VolumeOff as MuteIcon,
} from '@mui/icons-material';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, '0')}`;
}

function pathToMediaUrl(filePath) {
  if (!filePath) return '';
  return `local-media://play/${filePath.replace(/\\/g, '/')}`;
}

const MIME_BY_EXT = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
};

function getMime(filename) {
  const ext = (filename || '').match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
  return MIME_BY_EXT[ext] || 'video/mp4';
}

function findClipAtTime(clips, time) {
  if (time < 0) time = 0;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    if (time >= clip.position && time < clip.position + clip.duration) {
      return { index: i, localTime: Math.max(0, time - clip.position) };
    }
  }
  return null;
}

function findMusicAtTime(music, time) {
  if (time < 0) time = 0;
  let offset = 0;
  for (let i = 0; i < music.length; i++) {
    const track = music[i];
    if (time >= offset && time < offset + track.duration) {
      return { index: i, localTime: Math.max(0, time - offset) };
    }
    offset += track.duration;
  }
  return null;
}

/**
 * PreviewPlayer — loads ALL clip videos into memory as Blob URLs.
 * No custom protocol needed. Each clip = one <video> with a blob: src.
 * Switching clips = show/hide + seek. Instant, no loading.
 */
const PreviewPlayer = forwardRef(function PreviewPlayer({
  clips,
  music,
  isPlaying,
  initialTime = 0,
}, ref) {
  const containerRef = useRef(null);
  const videoElementsRef = useRef([]); // <video> DOM elements
  const blobUrlsRef = useRef([]);      // blob: URLs to revoke on cleanup
  const audioRef = useRef(null);
  const timeDisplayRef = useRef(null);
  const clipInfoRef = useRef(null);
  const musicInfoRef = useRef(null);
  const noClipRef = useRef(null);

  const [videoMuted, setVideoMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.7);
  const [loadingProgress, setLoadingProgress] = useState(null); // null = not loading, 0-100

  const timeRef = useRef(initialTime);
  const activeClipIndexRef = useRef(-1);
  const currentAudioSrc = useRef('');
  const isPlayingRef = useRef(isPlaying);
  const clipsRef = useRef(clips);
  const musicRef = useRef(music);
  const videoMutedRef = useRef(videoMuted);

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { musicRef.current = music; }, [music]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { videoMutedRef.current = videoMuted; }, [videoMuted]);

  // --- Load all clips into memory as Blob URLs, create <video> elements ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container || clips.length === 0) return;

    let cancelled = false;

    // Cleanup previous
    videoElementsRef.current.forEach(v => {
      v.pause();
      v.removeAttribute('src');
      v.load();
      if (v.parentNode) v.parentNode.removeChild(v);
    });
    blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    videoElementsRef.current = [];
    blobUrlsRef.current = [];
    activeClipIndexRef.current = -1;

    const loadAll = async () => {
      setLoadingProgress(0);
      const videos = [];
      const urls = [];

      for (let i = 0; i < clips.length; i++) {
        if (cancelled) return;

        const clip = clips[i];
        try {
          // Read file via IPC → Buffer → Blob → ObjectURL
          const buffer = await window.electronAPI.readFileBuffer(clip.path);
          const blob = new Blob([buffer], { type: getMime(clip.filename) });
          const blobUrl = URL.createObjectURL(blob);
          urls.push(blobUrl);

          // Create <video> element
          const video = document.createElement('video');
          video.preload = 'auto';
          video.playsInline = true;
          video.muted = videoMutedRef.current;
          video.style.cssText = 'width:100%;height:100%;object-fit:contain;position:absolute;top:0;left:0;display:none;';
          video.src = blobUrl;
          container.appendChild(video);
          videos.push(video);
        } catch (err) {
          console.error(`[Preview] Failed to load clip ${i}:`, clip.filename, err.message);
          // Push null placeholder to keep indices aligned
          urls.push(null);
          videos.push(null);
        }

        setLoadingProgress(Math.round(((i + 1) / clips.length) * 100));
      }

      if (cancelled) {
        // Cleanup if unmounted during loading
        videos.forEach(v => { if (v?.parentNode) v.parentNode.removeChild(v); });
        urls.forEach(u => { if (u) URL.revokeObjectURL(u); });
        return;
      }

      videoElementsRef.current = videos;
      blobUrlsRef.current = urls;
      setLoadingProgress(null);

      // Initial sync
      syncToTime(timeRef.current);
    };

    loadAll();

    return () => {
      cancelled = true;
      videoElementsRef.current.forEach(v => {
        if (v) { v.pause(); v.removeAttribute('src'); v.load(); if (v.parentNode) v.parentNode.removeChild(v); }
      });
      blobUrlsRef.current.forEach(u => { if (u) URL.revokeObjectURL(u); });
      videoElementsRef.current = [];
      blobUrlsRef.current = [];
    };
  }, [clips]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Core sync ---
  const syncToTime = useCallback((t) => {
    if (t < 0) t = 0;
    timeRef.current = t;
    const currentClips = clipsRef.current;
    const currentMusic = musicRef.current;
    const videos = videoElementsRef.current;
    const audio = audioRef.current;

    const clipInfo = findClipAtTime(currentClips, t);
    const prevIndex = activeClipIndexRef.current;

    if (!clipInfo) {
      if (prevIndex >= 0 && prevIndex < videos.length && videos[prevIndex]) {
        videos[prevIndex].pause();
        videos[prevIndex].style.display = 'none';
      }
      activeClipIndexRef.current = -1;
      if (noClipRef.current) noClipRef.current.style.display = 'flex';
      if (clipInfoRef.current) clipInfoRef.current.style.display = 'none';
    } else {
      const { index, localTime } = clipInfo;
      const video = videos[index];

      if (noClipRef.current) noClipRef.current.style.display = 'none';

      if (video) {
        if (index !== prevIndex) {
          // Switch clip
          if (prevIndex >= 0 && prevIndex < videos.length && videos[prevIndex]) {
            videos[prevIndex].pause();
            videos[prevIndex].style.display = 'none';
          }
          video.style.display = 'block';
          video.currentTime = localTime;
          if (isPlayingRef.current) video.play().catch(() => {});
          activeClipIndexRef.current = index;
        } else {
          // Same clip — nudge if drifted
          if (Math.abs(video.currentTime - localTime) > 0.3) {
            video.currentTime = localTime;
          }
          if (isPlayingRef.current && video.paused) {
            video.play().catch(() => {});
          }
        }
      }

      if (clipInfoRef.current) {
        clipInfoRef.current.style.display = 'block';
        clipInfoRef.current.textContent = `Clip ${index + 1}: ${currentClips[index].filename}`;
      }
    }

    // --- Audio ---
    const musicInfo = findMusicAtTime(currentMusic, t);
    const activeTrack = musicInfo ? currentMusic[musicInfo.index] : null;

    if (!activeTrack) {
      if (currentAudioSrc.current) {
        audio?.pause();
        audio?.removeAttribute('src');
        audio?.load();
        currentAudioSrc.current = '';
      }
      if (musicInfoRef.current) musicInfoRef.current.style.display = 'none';
    } else {
      const newSrc = pathToMediaUrl(activeTrack.path);
      const localTime = musicInfo.localTime;

      if (currentAudioSrc.current !== newSrc) {
        currentAudioSrc.current = newSrc;
        audio.src = newSrc;
        audio.load();
        audio.currentTime = Math.max(0, localTime);
        if (isPlayingRef.current) audio.play().catch(() => {});
      } else {
        if (Math.abs(audio.currentTime - localTime) > 0.3) {
          audio.currentTime = Math.max(0, localTime);
        }
      }

      if (musicInfoRef.current) {
        musicInfoRef.current.style.display = 'block';
        musicInfoRef.current.textContent = `Playing: ${activeTrack.filename}`;
      }
    }

    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = formatTime(t);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    setTime(t) { syncToTime(t); },
  }), [syncToTime]);

  // Play/Pause
  useEffect(() => {
    const videos = videoElementsRef.current;
    const audio = audioRef.current;
    const idx = activeClipIndexRef.current;
    if (isPlaying) {
      if (idx >= 0 && idx < videos.length && videos[idx]) videos[idx].play().catch(() => {});
      if (audio && currentAudioSrc.current) audio.play().catch(() => {});
    } else {
      videos.forEach(v => { if (v) v.pause(); });
      audio?.pause();
    }
  }, [isPlaying]);

  // Mute
  useEffect(() => {
    videoElementsRef.current.forEach(v => { if (v) v.muted = videoMuted; });
  }, [videoMuted]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicMuted ? 0 : musicVolume;
  }, [musicVolume, musicMuted]);

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box
        ref={containerRef}
        sx={{ position: 'relative', flex: 1, bgcolor: '#000', borderRadius: 1, overflow: 'hidden', minHeight: 0 }}
      >
        {/* Loading progress */}
        {loadingProgress !== null && (
          <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 5, textAlign: 'center', width: '60%' }}>
            <Typography color="text.secondary" sx={{ mb: 1 }}>
              Loading clips... {loadingProgress}%
            </Typography>
            <LinearProgress variant="determinate" value={loadingProgress} />
          </Box>
        )}

        <Box
          ref={noClipRef}
          sx={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'absolute', top: 0,
          }}
        >
          <Typography color="text.secondary">No clip at current position</Typography>
        </Box>

        <Box
          ref={clipInfoRef}
          sx={{
            display: 'none',
            position: 'absolute', bottom: 8, left: 8, right: 8,
            bgcolor: 'rgba(0,0,0,0.7)', borderRadius: 1, px: 1, py: 0.5,
            color: '#fff', fontSize: 12, zIndex: 2,
          }}
        />
      </Box>

      <audio ref={audioRef} style={{ display: 'none' }} />

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1, flexShrink: 0 }}>
        <Typography ref={timeDisplayRef} variant="body2" sx={{ minWidth: 80 }}>
          {formatTime(initialTime)}
        </Typography>

        <IconButton size="small" onClick={() => setVideoMuted(!videoMuted)} title="Toggle video sound">
          {videoMuted ? <MuteIcon fontSize="small" /> : <VolumeIcon fontSize="small" />}
        </IconButton>
        <Typography variant="caption" color="text.secondary">Video</Typography>

        <IconButton size="small" onClick={() => setMusicMuted(!musicMuted)} title="Toggle music" color="secondary">
          {musicMuted ? <MuteIcon fontSize="small" /> : <VolumeIcon fontSize="small" />}
        </IconButton>
        <Slider
          size="small"
          value={musicVolume}
          onChange={(e, v) => setMusicVolume(v)}
          min={0} max={1} step={0.1}
          sx={{ width: 80 }}
          disabled={musicMuted}
        />
        <Typography variant="caption" color="text.secondary">Music</Typography>
      </Stack>

      <Typography
        ref={musicInfoRef}
        variant="caption"
        color="text.secondary"
        sx={{ display: 'none', mt: 0.5, flexShrink: 0 }}
      />
    </Box>
  );
});

export default PreviewPlayer;
