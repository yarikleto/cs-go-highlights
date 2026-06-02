import { joinLocalPath } from './media';

const MIN_TIMELINE_DURATION = 60;

function toDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

export function clampTime(value) {
  const time = Number(value);
  return Number.isFinite(time) ? Math.max(0, time) : 0;
}

function formatTime(seconds, fractionDigits) {
  const time = clampTime(seconds);
  const mins = Math.floor(time / 60);
  const secs = fractionDigits > 0
    ? (time % 60).toFixed(fractionDigits)
    : Math.floor(time % 60).toString();
  const minWidth = fractionDigits > 0 ? 3 + fractionDigits : 2;

  return `${mins}:${secs.padStart(minWidth, '0')}`;
}

export function formatEditorTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  return formatTime(seconds, 1);
}

export function formatPreviewTime(seconds) {
  return formatTime(seconds, 1);
}

export function formatTimelineTime(seconds) {
  return formatTime(seconds, 0);
}

export function getTotalMusicDuration(music = []) {
  return music.reduce((sum, track) => sum + toDuration(track.duration), 0);
}

export function getTotalClipsDuration(clips = []) {
  if (clips.length === 0) return 0;
  return Math.max(...clips.map(clip => clampTime(clip.position) + toDuration(clip.duration)));
}

export function getTimelineDuration(clips = [], music = []) {
  return Math.max(getTotalMusicDuration(music), getTotalClipsDuration(clips), MIN_TIMELINE_DURATION);
}

export function getTimeMarkers(totalDuration, zoom) {
  const markers = [];
  let step = 60;

  if (zoom > 30) step = 30;
  if (zoom > 50) step = 15;
  if (zoom > 100) step = 5;

  for (let time = 0; time <= totalDuration; time += step) {
    markers.push(time);
  }

  return markers;
}

export function getMusicSegments(music = []) {
  let start = 0;

  return music.map((track, index) => {
    const duration = toDuration(track.duration);
    const segment = {
      track,
      index,
      start,
      duration,
      end: start + duration,
    };

    start += duration;
    return segment;
  });
}

export function findClipAtTime(clips = [], timeValue) {
  const time = clampTime(timeValue);

  for (let index = 0; index < clips.length; index++) {
    const clip = clips[index];
    const position = clampTime(clip.position);
    const duration = toDuration(clip.duration);

    if (time >= position && time < position + duration) {
      return { index, localTime: time - position };
    }
  }

  return null;
}

export function findMusicAtTime(music = [], timeValue) {
  const time = clampTime(timeValue);
  let offset = 0;

  for (let index = 0; index < music.length; index++) {
    const track = music[index];
    const duration = toDuration(track.duration);

    if (time >= offset && time < offset + duration) {
      return { index, localTime: time - offset };
    }

    offset += duration;
  }

  return null;
}

export function initializeClips(scannedClips = []) {
  let position = 0;

  return scannedClips.map((clip, index) => {
    const duration = toDuration(clip.duration);
    const initializedClip = {
      ...clip,
      index,
      duration,
      position,
      musicStart: position,
      musicEnd: position + duration,
    };

    position += duration;
    return initializedClip;
  });
}

function withMusicBounds(clip, position) {
  return {
    ...clip,
    position,
    musicStart: position,
    musicEnd: position + toDuration(clip.duration),
  };
}

export function moveClip(clips = [], clipIndex, requestedPosition, shiftKey = false) {
  const nextClips = [...clips];
  const clip = nextClips[clipIndex];

  if (!clip) return nextClips;

  const newPosition = clampTime(requestedPosition);

  if (shiftKey) {
    const clampedDelta = newPosition - clampTime(clip.position);

    for (let index = clipIndex; index < nextClips.length; index++) {
      const currentClip = nextClips[index];
      const position = clampTime(clampTime(currentClip.position) + clampedDelta);
      nextClips[index] = withMusicBounds(currentClip, position);
    }
  } else {
    const delta = newPosition - clampTime(clip.position);
    nextClips[clipIndex] = withMusicBounds(clip, newPosition);

    if (delta > 0) {
      for (let index = clipIndex + 1; index < nextClips.length; index++) {
        const other = nextClips[index];
        const movedClip = nextClips[clipIndex];
        const movedEnd = clampTime(movedClip.position) + toDuration(movedClip.duration);

        if (clampTime(other.position) < movedEnd) {
          nextClips[index] = withMusicBounds(other, movedEnd);
        }
      }
    }
  }

  return nextClips.sort((a, b) => clampTime(a.position) - clampTime(b.position));
}

export function appendUniqueMusicTracks(currentMusic = [], audioFiles = []) {
  const nextMusic = [...currentMusic];
  let order = currentMusic.length;

  for (const file of audioFiles) {
    if (!nextMusic.some(track => track.path === file.path)) {
      nextMusic.push({ ...file, order: order++ });
    }
  }

  return nextMusic;
}

export function createMusicTimelineData({
  clipsFolder,
  clips = [],
  music = [],
  totalMusicDuration,
  createdAt,
}) {
  return {
    version: 1,
    createdAt,
    clipsFolder,
    clips: clips.map(clip => ({
      filename: clip.filename,
      duration: clip.duration,
      position: clip.position,
      musicStart: clip.musicStart,
      musicEnd: clip.musicEnd,
    })),
    music: music.map(track => ({
      filename: track.filename,
      path: track.path,
      duration: track.duration,
      order: track.order,
    })),
    totalMusicDuration,
  };
}

export function hydrateTimelineClips(timelineClips = [], clipsFolder = '') {
  return timelineClips.map((clip, index) => ({
    ...clip,
    index,
    path: joinLocalPath(clipsFolder, clip.filename),
  }));
}

export function getDraggedClipPosition({ currentX, startX, startPosition, zoom }) {
  if (!Number.isFinite(zoom) || zoom <= 0) return clampTime(startPosition);
  return clampTime(clampTime(startPosition) + ((currentX - startX) / zoom));
}

export function getTimelineClickTime({ clientX, rectLeft, scrollLeft, zoom }) {
  if (!Number.isFinite(zoom) || zoom <= 0) return 0;
  return clampTime((clientX - rectLeft + scrollLeft) / zoom);
}
