import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Box, Typography, Slider, IconButton, Stack } from '@mui/material';
import {
  VolumeUp as VolumeIcon,
  VolumeOff as MuteIcon,
} from '@mui/icons-material';
import {
  findClipAtTime,
  findMusicAtTime,
  formatPreviewTime,
} from '../lib/musicEditor/timeline';
import { pathToMediaUrl } from '../lib/musicEditor/media';

const VIDEO_STYLE = 'width:100%;height:100%;object-fit:contain;position:absolute;top:0;left:0;display:none;';

function createVideoElement(clip, index, muted) {
  const src = pathToMediaUrl(clip?.path);
  if (!src) return null;

  const video = document.createElement('video');
  video.preload = 'metadata';
  video.playsInline = true;
  video.muted = muted;
  video.style.cssText = VIDEO_STYLE;
  video.src = src;
  video.addEventListener('error', () => {
    const message = video.error?.message || video.error?.code || 'unknown error';
    console.error(`[Preview] Failed to stream clip ${index}:`, clip.filename, message);
  });

  return video;
}

function disposeVideoElement(video) {
  if (!video) return;

  video.pause();
  video.removeAttribute('src');
  video.load();
  if (video.parentNode) video.parentNode.removeChild(video);
}

function hideVideo(video) {
  if (!video) return;

  video.pause();
  video.style.display = 'none';
}

function playMedia(media) {
  if (!media) return;
  media.play().catch(() => {});
}

function setMediaCurrentTime(media, time) {
  if (!media) return;

  const nextTime = Math.max(0, time);
  try {
    media.currentTime = nextTime;
  } catch (e) {
    media.addEventListener('loadedmetadata', () => {
      media.currentTime = nextTime;
    }, { once: true });
  }
}

function syncMediaCurrentTime(media, time, threshold = 0.3) {
  if (!media) return;
  if (Number.isNaN(media.currentTime) || Math.abs(media.currentTime - time) > threshold) {
    setMediaCurrentTime(media, time);
  }
}

/**
 * PreviewPlayer keeps one <video> element per clip, but sources each element
 * through local-media:// so the renderer does not read full clips into Blob URLs.
 */
const PreviewPlayer = forwardRef(function PreviewPlayer({
  clips,
  music,
  isPlaying,
  initialTime = 0,
}, ref) {
  const containerRef = useRef(null);
  const videoElementsRef = useRef([]); // <video> DOM elements
  const audioRef = useRef(null);
  const timeDisplayRef = useRef(null);
  const clipInfoRef = useRef(null);
  const musicInfoRef = useRef(null);
  const noClipRef = useRef(null);

  const [videoMuted, setVideoMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.7);

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
      hideVideo(videos[prevIndex]);
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
          hideVideo(videos[prevIndex]);
          video.style.display = 'block';
          setMediaCurrentTime(video, localTime);
          if (isPlayingRef.current) playMedia(video);
          activeClipIndexRef.current = index;
        } else {
          // Same clip — nudge if drifted
          video.style.display = 'block';
          syncMediaCurrentTime(video, localTime);
          if (isPlayingRef.current && video.paused) {
            playMedia(video);
          }
        }
      } else {
        hideVideo(videos[prevIndex]);
        activeClipIndexRef.current = -1;
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
        if (audio) {
          audio.src = newSrc;
          audio.load();
          setMediaCurrentTime(audio, localTime);
          if (isPlayingRef.current) playMedia(audio);
        }
      } else if (audio) {
        syncMediaCurrentTime(audio, localTime);
      }

      if (musicInfoRef.current) {
        musicInfoRef.current.style.display = 'block';
        musicInfoRef.current.textContent = `Playing: ${activeTrack.filename}`;
      }
    }

    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = formatPreviewTime(t);
    }
  }, []);

  // --- Create streamed video elements ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container || clips.length === 0) return;

    const videos = clips.map((clip, index) => createVideoElement(clip, index, videoMutedRef.current));
    videos.forEach(video => {
      if (video) container.appendChild(video);
    });

    videoElementsRef.current = videos;
    activeClipIndexRef.current = -1;
    syncToTime(timeRef.current);

    return () => {
      videos.forEach(disposeVideoElement);
      if (videoElementsRef.current === videos) {
        videoElementsRef.current = [];
      }
      activeClipIndexRef.current = -1;
    };
  }, [clips, syncToTime]);

  useImperativeHandle(ref, () => ({
    setTime(t) { syncToTime(t); },
  }), [syncToTime]);

  // Play/Pause
  useEffect(() => {
    const videos = videoElementsRef.current;
    const audio = audioRef.current;
    const idx = activeClipIndexRef.current;
    if (isPlaying) {
      if (idx >= 0 && idx < videos.length && videos[idx]) playMedia(videos[idx]);
      if (audio && currentAudioSrc.current) playMedia(audio);
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
          {formatPreviewTime(initialTime)}
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
