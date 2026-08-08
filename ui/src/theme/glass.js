import { tokens } from './tokens';

/**
 * Translucent panel — the standard elevated surface.
 *
 * The inset top highlight is what makes the top edge catch light; without it
 * the panel reads as a flat translucent rectangle rather than glass.
 */
export function glassSurface({
  radius = tokens.radius.lg,
  blur = tokens.blur.panel,
  background = tokens.surface.glass,
  border = tokens.hairline,
  shadow = '0 8px 32px rgba(0, 0, 0, 0.28)',
} = {}) {
  return {
    background,
    backgroundImage: 'none',
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
    border: border ? `1px solid ${border}` : 'none',
    borderRadius: radius,
    boxShadow: ['inset 0 1px 0 rgba(255, 255, 255, 0.08)', shadow].filter(Boolean).join(', '),
  };
}

/**
 * Recessed surface — log output, video frame, timeline tracks.
 *
 * No backdrop blur here: these sit *under* the glass, not on it.
 */
export function sunkenSurface({ radius = tokens.radius.md, deep = false } = {}) {
  return {
    background: deep ? tokens.surface.sunkenDeep : tokens.surface.sunken,
    backgroundImage: 'none',
    border: `1px solid ${tokens.hairline}`,
    borderRadius: radius,
    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.40)',
  };
}
