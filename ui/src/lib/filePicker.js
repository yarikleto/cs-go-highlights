export function visibleEntries(entries, { mode, extensions = [] }) {
  const allowedExtensions = extensions.map(normalizeExtension);

  return entries.filter((entry) => {
    if (entry.name.startsWith('.')) return false;
    if (entry.isDirectory) return true;
    if (mode === 'folder') return false;
    return allowedExtensions.length === 0 || allowedExtensions.includes(extensionOf(entry.name));
  });
}

export function withDefaultExtension(fileName, extensions) {
  if (extensions.length === 0) return fileName;

  const allowedExtensions = extensions.map(normalizeExtension);
  if (allowedExtensions.includes(extensionOf(fileName))) return fileName;
  return `${fileName}.${allowedExtensions[0]}`;
}

export function joinSavePath(directory, fileName, separator) {
  const base = directory.endsWith(separator) ? directory : `${directory}${separator}`;
  return `${base}${fileName}`;
}

function normalizeExtension(extension) {
  return extension.replace(/^\./, '').toLowerCase();
}

function extensionOf(fileName) {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex <= 0 ? '' : fileName.slice(dotIndex + 1).toLowerCase();
}
