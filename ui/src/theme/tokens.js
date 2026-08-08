/**
 * Design tokens for the glass UI.
 *
 * Every colour, radius and timing in the renderer resolves here. Components
 * should not hardcode colour values — import from this file or use the
 * helpers in `glass.js`.
 */

export const tokens = {
  // Painted backdrop. The window itself is opaque; this gradient is what the
  // translucent surfaces blur against.
  //
  // CS2 palette: neutral gunmetal, amber accent. The washes stay faint on
  // purpose — CS2 menus are near-neutral and let the orange do the work.
  backdrop: {
    base: '#14171A',
    end: '#1C2024',
    washes: [
      'radial-gradient(1200px 620px at 12% -12%, rgba(222, 155, 53, 0.10), transparent 62%)',
      'radial-gradient(900px 520px at 96% 4%, rgba(94, 152, 217, 0.06), transparent 58%)',
      'radial-gradient(760px 760px at 62% 112%, rgba(222, 155, 53, 0.05), transparent 60%)',
    ],
  },

  surface: {
    glass: 'rgba(255, 255, 255, 0.055)',
    glassHi: 'rgba(255, 255, 255, 0.08)',
    glassLo: 'rgba(255, 255, 255, 0.03)',
    sunken: 'rgba(0, 0, 0, 0.30)',
    sunkenDeep: 'rgba(0, 0, 0, 0.46)',
  },

  hairline: 'rgba(255, 255, 255, 0.09)',
  hairlineStrong: 'rgba(255, 255, 255, 0.14)',

  text: {
    primary: '#E8EAEC',
    secondary: '#98A0A8',
    disabled: '#5E666E',
  },

  // CS2 amber.
  accent: '#DE9B35',
  accentSoft: 'rgba(222, 155, 53, 0.16)',
  accentSofter: 'rgba(222, 155, 53, 0.10)',

  // Drawn from CS2's own signalling: T yellow, CT blue, bomb red.
  status: {
    success: '#8CC63F',
    warning: '#DEB93F',
    error: '#EB4B4B',
    info: '#5E98D9',
  },

  // `saturate` before `blur` is what separates glass from a grey wash.
  blur: {
    panel: 'saturate(180%) blur(24px)',
    bar: 'saturate(180%) blur(30px)',
  },

  // Tighter than the Apple idiom — CS2's chrome is closer to square.
  radius: {
    sm: 6,
    md: 8,
    lg: 10,
    xl: 14,
  },

  motion: {
    easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
    duration: 160,
  },

  titleBarHeight: 44,
  sidebarWidth: 248,
};

export const transition = (properties = ['background-color', 'border-color', 'color', 'transform', 'box-shadow']) =>
  properties
    .map((property) => `${property} ${tokens.motion.duration}ms ${tokens.motion.easing}`)
    .join(', ');
