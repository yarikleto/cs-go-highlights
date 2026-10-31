function detectSeparator(basePath) {
  return String(basePath || '').includes('\\') ? '\\' : '/';
}

function trimTrailingSeparators(value) {
  const text = String(value || '');
  if (text === '/') return text;
  if (/^[A-Za-z]:[\\/]?$/.test(text)) return text.replace(/[\\/]?$/, '');
  return text.replace(/[\\/]+$/, '');
}

export function joinLocalPath(basePath, ...segments) {
  const separator = detectSeparator(basePath);
  const cleanedBase = trimTrailingSeparators(basePath);
  const cleanedSegments = segments
    .filter(segment => segment !== null && segment !== undefined && segment !== '')
    .map(segment => String(segment).replace(/^[\\/]+|[\\/]+$/g, ''));

  if (cleanedSegments.length === 0) return cleanedBase;
  if (!cleanedBase) return cleanedSegments.join(separator);
  if (cleanedBase === '/') return `/${cleanedSegments.join('/')}`;
  if (/^[A-Za-z]:$/.test(cleanedBase)) return `${cleanedBase}${separator}${cleanedSegments.join(separator)}`;

  return [cleanedBase, ...cleanedSegments].join(separator);
}

export function pathToMediaUrl(filePath) {
  if (!filePath) return '';
  return `/media?path=${encodeURIComponent(filePath)}`;
}
