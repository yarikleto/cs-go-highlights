export function hasValue(value) {
  return value !== null && value !== undefined;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function getHighlightsFileType(data) {
  if (data?.fileType) return data.fileType;
  if (hasValue(data?.topCount)) return 'highlights-top';
  if (data?.postprocessedAt) return 'highlights-postprocess';
  if (data?.demos) return 'highlights';
  return 'unknown';
}

export function extractMapFromFilename(filename) {
  if (!filename) return null;

  const match = String(filename).match(/de_[a-z0-9_]+/i);
  return match ? match[0] : null;
}

function normalizeHighlight(highlight, demoFile, demoMap) {
  const source = highlight || {};
  const normalizedDemoFile = demoFile === undefined
    ? source.demoFile
    : demoFile || source.demoFile;

  return {
    ...source,
    demoFile: normalizedDemoFile,
    map: source.map || demoMap || extractMapFromFilename(normalizedDemoFile),
  };
}

export function normalizeHighlights(data) {
  if (!data) return [];

  if (
    data.fileType === 'highlights-top' ||
    (Array.isArray(data.highlights) && !data.demos)
  ) {
    const highlights = asArray(data.highlights);
    return highlights.map(highlight => normalizeHighlight(highlight));
  }

  if (Array.isArray(data.demos)) {
    return data.demos.flatMap(demo => {
      const sourceDemo = demo || {};
      const demoMap = sourceDemo.map || extractMapFromFilename(sourceDemo.file);
      const highlights = asArray(sourceDemo.highlights);

      return highlights.map(highlight => normalizeHighlight(
        highlight,
        sourceDemo.file,
        demoMap
      ));
    });
  }

  return [];
}

export function filterHighlights(highlights, filters = {}) {
  const {
    typeFilter = '',
    playerFilter = '',
    demoFilter = '',
    mapFilter = '',
  } = filters || {};
  const playerFilterValue = hasValue(playerFilter) ? String(playerFilter) : '';
  const demoFilterValue = hasValue(demoFilter) ? String(demoFilter) : '';
  const playerQuery = playerFilterValue.toLowerCase();
  const demoQuery = demoFilterValue.toLowerCase();

  return asArray(highlights).filter(highlight => {
    const source = highlight || {};

    if (typeFilter && source.type !== typeFilter) return false;

    if (playerFilterValue) {
      const playerName = hasValue(source.player?.name)
        ? String(source.player.name).toLowerCase()
        : '';
      const steamId = hasValue(source.player?.steamId)
        ? String(source.player.steamId)
        : '';

      if (!playerName.includes(playerQuery) && !steamId.includes(playerFilterValue)) {
        return false;
      }
    }

    if (demoFilterValue) {
      const demoFile = hasValue(source.demoFile)
        ? String(source.demoFile).toLowerCase()
        : '';
      if (!demoFile.includes(demoQuery)) return false;
    }

    if (mapFilter && source.map !== mapFilter) return false;

    return true;
  });
}

function getSortedUniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

export function getUniqueHighlightTypes(highlights) {
  return getSortedUniqueValues(asArray(highlights).map(highlight => highlight?.type));
}

export function getUniqueHighlightMaps(highlights) {
  return getSortedUniqueValues(asArray(highlights).map(highlight => highlight?.map));
}

export function getHighlightKillCount(highlight) {
  const source = highlight || {};

  if (hasValue(source.killCount)) return source.killCount;
  if (Array.isArray(source.kills)) return source.kills.length;
  return null;
}

export function getHighlightSortValue(highlight, column) {
  const source = highlight || {};

  switch (column) {
    case 'rank': return source.rank ?? Infinity;
    case 'type': return source.type || '';
    case 'player': return hasValue(source.player?.name)
      ? String(source.player.name).toLowerCase()
      : '';
    case 'kills': return getHighlightKillCount(source) ?? 0;
    case 'points': return source.points ?? 0;
    case 'duration': return source.durationSeconds ?? 0;
    case 'map': return source.map || '';
    case 'demo': return source.demoFile || '';
    case 'tick': return source.startTick ?? 0;
    default: return 0;
  }
}

export function sortHighlights(highlights, sortBy, sortDir = 'asc') {
  const highlightList = asArray(highlights);

  if (!sortBy) return highlightList;

  return [...highlightList].sort((a, b) => {
    const valueA = getHighlightSortValue(a, sortBy);
    const valueB = getHighlightSortValue(b, sortBy);
    const comparison = typeof valueA === 'string'
      ? valueA.localeCompare(valueB)
      : valueA - valueB;

    return sortDir === 'asc' ? comparison : -comparison;
  });
}

export function hasHighlightValue(highlights, field) {
  return asArray(highlights).some(highlight => hasValue(highlight?.[field]));
}

export function formatDuration(seconds) {
  if (!hasValue(seconds)) return '-';

  const numericSeconds = Number(seconds);
  if (!Number.isFinite(numericSeconds)) return '-';

  return `${numericSeconds.toFixed(1)}s`;
}

export function formatKills(highlight) {
  const killCount = getHighlightKillCount(highlight);
  return hasValue(killCount) ? killCount : '-';
}

export function formatRank(rank) {
  return hasValue(rank) ? `#${rank}` : '-';
}

export function formatOptionalValue(value) {
  return hasValue(value) ? value : '-';
}

export function formatDistanceMeters(distance) {
  if (!hasValue(distance)) return '-';

  const numericDistance = Number(distance);
  if (!Number.isFinite(numericDistance)) return '-';

  return `${numericDistance.toFixed(1)}m`;
}
