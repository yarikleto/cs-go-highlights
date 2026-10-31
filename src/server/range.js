const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

/**
 * @returns {{ start: number, end: number } | { invalid: true } | null}
 *   byte offsets (inclusive), `invalid` for an unsatisfiable range, `null` when no usable header was sent.
 */
export function parseRange(rangeHeader, fileSize) {
  const match = rangeHeader ? RANGE_PATTERN.exec(rangeHeader) : null;
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    const suffixLength = parseInt(rawEnd, 10);
    if (suffixLength <= 0) return { invalid: true };
    return { start: Math.max(fileSize - suffixLength, 0), end: fileSize - 1 };
  }

  const start = parseInt(rawStart, 10);
  const end = rawEnd ? parseInt(rawEnd, 10) : fileSize - 1;
  if (end < start || start >= fileSize) return { invalid: true };

  return { start, end: Math.min(end, fileSize - 1) };
}
