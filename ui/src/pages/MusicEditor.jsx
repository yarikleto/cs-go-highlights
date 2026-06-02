import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  FolderOpen as FolderIcon,
  MusicNote as MusicIcon,
  Save as SaveIcon,
  FileOpen as LoadIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
} from '@mui/icons-material';
import Timeline from '../components/Timeline';
import PreviewPlayer from '../components/PreviewPlayer';
import { joinLocalPath } from '../lib/musicEditor/media';
import {
  appendUniqueMusicTracks,
  createMusicTimelineData,
  formatEditorTime,
  getTotalClipsDuration,
  getTotalMusicDuration,
  hydrateTimelineClips,
  initializeClips,
  moveClip,
} from '../lib/musicEditor/timeline';

export default function MusicEditor() {
  // Data state (causes re-render only when data changes)
  const [clips, setClips] = useState([]);
  const [music, setMusic] = useState([]);
  const [clipsFolder, setClipsFolder] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(50);
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [previewHeight, setPreviewHeight] = useState(380);

  // Time as ref - NO state, NO re-renders during playback
  const timeRef = useRef(0);
  const animationRef = useRef(null);
  const timeDisplayRef = useRef(null);
  const timelineRef = useRef(null);
  const previewRef = useRef(null);

  const totalMusicDuration = useMemo(() => getTotalMusicDuration(music), [music]);
  const totalClipsDuration = useMemo(() => getTotalClipsDuration(clips), [clips]);

  // Imperatively update all time-dependent UI
  const syncUI = useCallback(() => {
    const t = timeRef.current;
    // Update time display
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = formatEditorTime(t);
    }
    // Update timeline playhead
    if (timelineRef.current) {
      timelineRef.current.setTime(t);
    }
    // Update preview player
    if (previewRef.current) {
      previewRef.current.setTime(t);
    }
  }, []);

  // Seek to a specific time (called by timeline click, clip select, etc.)
  const seekTo = useCallback((t) => {
    timeRef.current = Math.max(0, t);
    syncUI();
  }, [syncUI]);

  // Playback animation loop
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      timeRef.current = Math.max(0, timeRef.current + dt);
      syncUI();
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, syncUI]);

  // Play/Pause
  const togglePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  // Spacebar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.target.closest('input, textarea, select')) {
        e.preventDefault();
        togglePlayPause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause]);

  // Select clips folder
  const handleSelectClipsFolder = async () => {
    try {
      const folder = await window.electronAPI.selectFolder();
      if (!folder) return;
      setLoading(true);
      setError(null);
      setClipsFolder(folder);
      const scannedClips = await window.electronAPI.scanClips(folder);
      if (scannedClips.length === 0) {
        setError('No video files found in the selected folder');
        setClips([]);
        return;
      }
      setClips(initializeClips(scannedClips));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMusic = async () => {
    try {
      const audioFiles = await window.electronAPI.selectAudioFiles();
      if (!audioFiles || audioFiles.length === 0) return;
      setMusic(prev => appendUniqueMusicTracks(prev, audioFiles));
    } catch (e) {
      setError(e.message);
    }
  };

  const handleClipMove = useCallback((clipIndex, newPosition, shiftKey = false) => {
    setClips(prev => moveClip(prev, clipIndex, newPosition, shiftKey));
  }, []);

  const handleSave = async () => {
    try {
      const result = await window.electronAPI.selectFolder();
      if (!result) return;
      const outputPath = joinLocalPath(result, 'music-timeline.json');
      const data = createMusicTimelineData({
        clipsFolder,
        clips,
        music,
        totalMusicDuration,
        createdAt: new Date().toISOString(),
      });
      await window.electronAPI.saveMusicTimeline(outputPath, data);
      alert(`Saved to: ${outputPath}`);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleLoad = async () => {
    try {
      const file = await window.electronAPI.selectFile({ name: 'JSON', extensions: ['json'] });
      if (!file) return;
      setLoading(true);
      const data = await window.electronAPI.loadMusicTimeline(file);
      if (data.version !== 1) throw new Error('Unsupported timeline version');
      if (data.clipsFolder) {
        setClipsFolder(data.clipsFolder);
        setClips(hydrateTimelineClips(data.clips, data.clipsFolder));
      }
      if (data.music) setMusic(data.music);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClipSelect = useCallback((index) => {
    setSelectedClipIndex(index);
  }, []);

  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.5, 500));
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.5, 5));
  const handleZoomChange = useCallback((updater) => setZoom(updater), []);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = previewHeight;
    const onMove = (ev) => setPreviewHeight(Math.max(80, Math.min(900, startHeight + (ev.clientY - startY))));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [previewHeight]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, gap: 1, overflow: 'hidden' }}>
      {/* Header */}
      <Paper sx={{ p: 2, flexShrink: 0 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Button variant="contained" startIcon={<FolderIcon />} onClick={handleSelectClipsFolder} disabled={loading}>
            Select Clips Folder
          </Button>
          <Button variant="outlined" startIcon={<MusicIcon />} onClick={handleAddMusic} disabled={loading}>
            Add Music
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" startIcon={<LoadIcon />} onClick={handleLoad} disabled={loading}>Load</Button>
          <Button variant="contained" color="success" startIcon={<SaveIcon />} onClick={handleSave} disabled={clips.length === 0}>Save</Button>
        </Stack>
        {clipsFolder && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Clips: {clipsFolder}
          </Typography>
        )}
      </Paper>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}

      {!loading && clips.length > 0 && (
        <>
          {/* Preview + Info */}
          <Paper sx={{ p: 2, height: previewHeight, flexShrink: 0, overflow: 'hidden', display: 'flex' }}>
            <Box sx={{ height: '100%', aspectRatio: '16/9', flexShrink: 0 }}>
              <PreviewPlayer
                ref={previewRef}
                clips={clips}
                music={music}
                isPlaying={isPlaying}
                initialTime={timeRef.current}
              />
            </Box>
            <Box sx={{ flex: 1, pl: 3, display: 'flex', flexDirection: 'column', overflow: 'auto', minWidth: 0 }}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
                <IconButton onClick={togglePlayPause} color="primary" size="large">
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </IconButton>
                <Typography ref={timeDisplayRef} variant="h5" sx={{ fontFamily: 'monospace' }}>
                  {formatEditorTime(timeRef.current)}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={3} flexWrap="wrap" sx={{ mb: 1.5 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Clips</Typography>
                  <Typography variant="body1"><strong>{clips.length}</strong></Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Clips Duration</Typography>
                  <Typography variant="body1"><strong>{formatEditorTime(totalClipsDuration)}</strong></Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Music Tracks</Typography>
                  <Typography variant="body1"><strong>{music.length}</strong></Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Music Duration</Typography>
                  <Typography variant="body1"><strong>{formatEditorTime(totalMusicDuration)}</strong></Typography>
                </Box>
              </Stack>
              {music.length > 0 && (
                <Box sx={{ flex: 1, overflow: 'auto' }}>
                  <Typography variant="caption" color="text.secondary">Music Tracks:</Typography>
                  {music.map((track, i) => (
                    <Typography key={i} variant="body2" color="text.secondary" noWrap>
                      {i + 1}. {track.filename} ({formatEditorTime(track.duration)})
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          </Paper>

          {/* Resize handle */}
          <Box
            onMouseDown={handleResizeStart}
            sx={{ height: 12, cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mx: 'auto', width: 60, borderRadius: 1, '&:hover': { bgcolor: 'action.selected' } }}
          >
            <Box sx={{ width: 40, height: 4, bgcolor: 'text.disabled', borderRadius: 2 }} />
          </Box>

          {/* Timeline */}
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 60, overflow: 'hidden' }}>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
              <Typography variant="subtitle1">Timeline</Typography>
              <Box sx={{ flex: 1 }} />
              <Tooltip title="Zoom Out">
                <IconButton onClick={handleZoomOut} size="small"><ZoomOutIcon /></IconButton>
              </Tooltip>
              <Typography variant="body2">{zoom.toFixed(0)} px/s</Typography>
              <Tooltip title="Zoom In">
                <IconButton onClick={handleZoomIn} size="small"><ZoomInIcon /></IconButton>
              </Tooltip>
            </Stack>
            <Timeline
              ref={timelineRef}
              clips={clips}
              music={music}
              initialTime={timeRef.current}
              zoom={zoom}
              onZoomChange={handleZoomChange}
              onClipMove={handleClipMove}
              onSeek={seekTo}
              onClipSelect={handleClipSelect}
              selectedClipIndex={selectedClipIndex}
            />
          </Paper>
        </>
      )}

      {!loading && clips.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>No clips loaded</Typography>
          <Typography color="text.secondary">Select a folder with video clips to get started, or load an existing timeline.</Typography>
        </Paper>
      )}
    </Box>
  );
}
