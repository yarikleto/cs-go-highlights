import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';

const CLIP_COLORS = [
  '#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0',
  '#00BCD4', '#FFEB3B', '#795548', '#607D8B', '#F44336',
];

const MUSIC_COLORS = [
  '#7C4DFF', '#651FFF', '#536DFE', '#448AFF', '#40C4FF',
];

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const Timeline = forwardRef(function Timeline({
  clips,
  music,
  initialTime = 0,
  zoom,
  onZoomChange,
  onClipMove,
  onSeek,
  onClipSelect,
  selectedClipIndex,
}, ref) {
  const containerRef = useRef(null);
  const playheadRef = useRef(null);
  const [draggingClip, setDraggingClip] = useState(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartPos, setDragStartPos] = useState(0);
  const shiftDragRef = useRef(false);

  // Expose setTime to parent — updates playhead via DOM, no re-render
  useImperativeHandle(ref, () => ({
    setTime(t) {
      if (playheadRef.current) {
        playheadRef.current.style.left = `${t * zoom}px`;
      }
    },
  }), [zoom]);

  // Set initial playhead position
  useEffect(() => {
    if (playheadRef.current) {
      playheadRef.current.style.left = `${initialTime * zoom}px`;
    }
  }, [zoom]); // re-apply when zoom changes

  const totalMusicDuration = music.reduce((sum, m) => sum + m.duration, 0);
  const maxClipEnd = clips.length > 0
    ? Math.max(...clips.map(c => c.position + c.duration))
    : 0;
  const totalDuration = Math.max(totalMusicDuration, maxClipEnd, 60);
  const timelineWidth = totalDuration * zoom;

  const getTimeMarkers = () => {
    const markers = [];
    let step = 60;
    if (zoom > 30) step = 30;
    if (zoom > 50) step = 15;
    if (zoom > 100) step = 5;
    for (let t = 0; t <= totalDuration; t += step) {
      markers.push(t);
    }
    return markers;
  };

  const handleClipMouseDown = (e, clipIndex) => {
    e.preventDefault();
    e.stopPropagation();
    const clip = clips[clipIndex];
    setDraggingClip(clipIndex);
    setDragStartX(e.clientX);
    setDragStartPos(clip.position);
    shiftDragRef.current = e.shiftKey;
    onClipSelect?.(clipIndex);
  };

  const handleMouseMove = useCallback((e) => {
    if (draggingClip === null) return;
    const deltaX = e.clientX - dragStartX;
    const deltaTime = deltaX / zoom;
    let newPosition = dragStartPos + deltaTime;
    if (newPosition < 0) newPosition = 0;
    onClipMove?.(draggingClip, newPosition, shiftDragRef.current);
  }, [draggingClip, dragStartX, dragStartPos, zoom, onClipMove]);

  const handleMouseUp = useCallback(() => {
    setDraggingClip(null);
  }, []);

  useEffect(() => {
    if (draggingClip !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingClip, handleMouseMove, handleMouseUp]);

  const handleTimelineClick = (e) => {
    if (draggingClip !== null) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left + (containerRef.current?.scrollLeft || 0);
    const time = x / zoom;
    onSeek?.(Math.max(0, time));
  };

  // Ctrl + mouse wheel = zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1; // scroll down = zoom out, up = zoom in
      const factor = delta > 0 ? 1.2 : 1 / 1.2;
      onZoomChange?.((prev) => Math.max(5, Math.min(500, prev * factor)));
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [onZoomChange]);

  return (
    <Box
      ref={containerRef}
      sx={{
        flex: 1,
        overflow: 'auto',
        position: 'relative',
        bgcolor: '#1a1a2e',
        borderRadius: 1,
        cursor: draggingClip !== null ? 'grabbing' : 'default',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          minWidth: timelineWidth + 100,
          minHeight: 200,
        }}
        onClick={handleTimelineClick}
      >
        {/* Time markers */}
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, borderBottom: '1px solid #333', display: 'flex' }}>
          {getTimeMarkers().map((time) => (
            <Box key={time} sx={{ position: 'absolute', left: time * zoom, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Typography variant="caption" sx={{ color: '#888', fontSize: 10 }}>{formatTime(time)}</Typography>
              <Box sx={{ width: 1, height: 8, bgcolor: '#444' }} />
            </Box>
          ))}
        </Box>

        {/* Clips track */}
        <Box sx={{ position: 'absolute', top: 30, left: 0, right: 0, height: 60, borderBottom: '1px solid #333' }}>
          <Typography variant="caption" sx={{ position: 'absolute', left: -60, top: '50%', transform: 'translateY(-50%) rotate(-90deg)', color: '#666', whiteSpace: 'nowrap' }}>
            Clips
          </Typography>
          {clips.map((clip, index) => {
            const isSelected = selectedClipIndex === index;
            const isDragging = draggingClip === index;
            const clipColor = CLIP_COLORS[index % CLIP_COLORS.length];
            return (
              <Tooltip key={clip.filename} title={`${clip.filename} (${formatTime(clip.duration)})`} placement="top">
                <Box
                  onMouseDown={(e) => handleClipMouseDown(e, index)}
                  sx={{
                    position: 'absolute',
                    left: clip.position * zoom,
                    width: Math.max(clip.duration * zoom, 2),
                    height: 50,
                    top: 5,
                    bgcolor: clipColor,
                    borderRadius: 1,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    border: isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                    boxShadow: isSelected ? '0 0 10px rgba(255,255,255,0.5)' : 'none',
                    opacity: isDragging ? 0.8 : 1,
                    transition: isDragging ? 'none' : 'box-shadow 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    '&:hover': { filter: 'brightness(1.2)' },
                  }}
                >
                  <Typography variant="caption" sx={{ color: '#fff', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', px: 0.5, textShadow: '0 0 3px rgba(0,0,0,0.8)' }}>
                    {index + 1}
                  </Typography>
                </Box>
              </Tooltip>
            );
          })}
        </Box>

        {/* Music track */}
        <Box sx={{ position: 'absolute', top: 100, left: 0, right: 0, height: 60, borderBottom: '1px solid #333' }}>
          <Typography variant="caption" sx={{ position: 'absolute', left: -60, top: '50%', transform: 'translateY(-50%) rotate(-90deg)', color: '#666', whiteSpace: 'nowrap' }}>
            Music
          </Typography>
          {(() => {
            let offset = 0;
            return music.map((track, index) => {
              const el = (
                <Tooltip key={track.filename} title={`${track.filename} (${formatTime(track.duration)})`} placement="bottom">
                  <Box
                    sx={{
                      position: 'absolute',
                      left: offset * zoom,
                      width: Math.max(track.duration * zoom, 2),
                      height: 50,
                      top: 5,
                      bgcolor: MUSIC_COLORS[index % MUSIC_COLORS.length],
                      borderRadius: 1,
                      border: '1px solid rgba(255,255,255,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    <Typography variant="caption" sx={{ color: '#fff', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', px: 1, textShadow: '0 0 3px rgba(0,0,0,0.8)' }}>
                      {track.filename}
                    </Typography>
                  </Box>
                </Tooltip>
              );
              offset += track.duration;
              return el;
            });
          })()}
        </Box>

        {/* Playhead — updated via ref, no re-renders */}
        <Box
          ref={playheadRef}
          sx={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 2,
            bgcolor: '#ff4444',
            pointerEvents: 'none',
            zIndex: 10,
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: -6,
              width: 0,
              height: 0,
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: '10px solid #ff4444',
            },
          }}
        />
      </Box>
    </Box>
  );
});

export default Timeline;
