import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import {
  formatTimelineTime,
  getDraggedClipPosition,
  getMusicSegments,
  getTimeMarkers,
  getTimelineClickTime,
  getTimelineDuration,
} from '../lib/musicEditor/timeline';
import { tokens } from '../theme/tokens';
import { sunkenSurface } from '../theme/glass';

// Clips stay in a cool, muted family so a long timeline reads as one surface;
// music takes the amber accent so the two tracks are told apart by hue.
const CLIP_COLORS = [
  '#5E98D9', '#4E8F86', '#7A8C99', '#6B7FA8', '#8C9B5E',
  '#5D7EA0', '#9A8B6E', '#6E8C7A', '#84909B', '#5F8AA0',
];

const MUSIC_COLORS = [
  '#DE9B35', '#C4832B', '#B96F2C', '#D0A73F', '#A9702A',
];

const CLIP_RADIUS = 6;

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

  const totalDuration = getTimelineDuration(clips, music);
  const timelineWidth = totalDuration * zoom;
  const timeMarkers = getTimeMarkers(totalDuration, zoom);
  const musicSegments = getMusicSegments(music);

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
    const newPosition = getDraggedClipPosition({
      currentX: e.clientX,
      startX: dragStartX,
      startPosition: dragStartPos,
      zoom,
    });
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
    const time = getTimelineClickTime({
      clientX: e.clientX,
      rectLeft: rect.left,
      scrollLeft: containerRef.current?.scrollLeft || 0,
      zoom,
    });
    onSeek?.(time);
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
        ...sunkenSurface({ radius: tokens.radius.md }),
        flex: 1,
        overflow: 'auto',
        position: 'relative',
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
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, borderBottom: `1px solid ${tokens.hairline}`, display: 'flex' }}>
          {timeMarkers.map((time) => (
            <Box key={time} sx={{ position: 'absolute', left: time * zoom, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Typography variant="caption" sx={{ color: tokens.text.secondary, fontSize: 10 }}>{formatTimelineTime(time)}</Typography>
              <Box sx={{ width: 1, height: 8, bgcolor: tokens.hairlineStrong }} />
            </Box>
          ))}
        </Box>

        {/* Clips track */}
        <Box sx={{ position: 'absolute', top: 30, left: 0, right: 0, height: 60, borderBottom: `1px solid ${tokens.hairline}` }}>
          <Typography variant="caption" sx={{ position: 'absolute', left: -60, top: '50%', transform: 'translateY(-50%) rotate(-90deg)', color: tokens.text.disabled, whiteSpace: 'nowrap' }}>
            Clips
          </Typography>
          {clips.map((clip, index) => {
            const isSelected = selectedClipIndex === index;
            const isDragging = draggingClip === index;
            const clipColor = CLIP_COLORS[index % CLIP_COLORS.length];
            return (
              <Tooltip key={clip.filename} title={`${clip.filename} (${formatTimelineTime(clip.duration)})`} placement="top">
                <Box
                  onMouseDown={(e) => handleClipMouseDown(e, index)}
                  sx={{
                    position: 'absolute',
                    left: clip.position * zoom,
                    width: Math.max(clip.duration * zoom, 2),
                    height: 50,
                    top: 5,
                    bgcolor: clipColor,
                    borderRadius: `${CLIP_RADIUS}px`,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    border: isSelected
                      ? `1px solid ${tokens.text.primary}`
                      : `1px solid ${tokens.hairlineStrong}`,
                    boxShadow: isSelected
                      ? `0 0 0 2px ${tokens.accentSoft}, 0 4px 14px rgba(0,0,0,0.4)`
                      : 'inset 0 1px 0 rgba(255,255,255,0.14)',
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
        <Box sx={{ position: 'absolute', top: 100, left: 0, right: 0, height: 60, borderBottom: `1px solid ${tokens.hairline}` }}>
          <Typography variant="caption" sx={{ position: 'absolute', left: -60, top: '50%', transform: 'translateY(-50%) rotate(-90deg)', color: tokens.text.disabled, whiteSpace: 'nowrap' }}>
            Music
          </Typography>
          {musicSegments.map(({ track, index, start, duration }) => (
            <Tooltip key={track.filename} title={`${track.filename} (${formatTimelineTime(duration)})`} placement="bottom">
              <Box
                sx={{
                  position: 'absolute',
                  left: start * zoom,
                  width: Math.max(duration * zoom, 2),
                  height: 50,
                  top: 5,
                  bgcolor: MUSIC_COLORS[index % MUSIC_COLORS.length],
                  borderRadius: `${CLIP_RADIUS}px`,
                  border: `1px solid ${tokens.hairlineStrong}`,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)',
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
          ))}
        </Box>

        {/* Playhead — updated via ref, no re-renders */}
        <Box
          ref={playheadRef}
          sx={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 2,
            bgcolor: tokens.status.error,
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
              borderTop: `10px solid ${tokens.status.error}`,
            },
          }}
        />
      </Box>
    </Box>
  );
});

export default Timeline;
