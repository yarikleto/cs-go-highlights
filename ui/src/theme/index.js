import { createTheme, alpha } from '@mui/material/styles';
import { tokens, transition } from './tokens';
import { glassSurface, sunkenSurface } from './glass';

const FONT_STACK =
  '-apple-system, "Segoe UI Variable Text", "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif';
const DISPLAY_STACK =
  '-apple-system, "Segoe UI Variable Display", "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif';
export const MONO_STACK =
  '"Cascadia Code", "SF Mono", ui-monospace, "JetBrains Mono", Consolas, monospace';

/** Resolves an `ownerState.color` to a palette colour, or null for `default`/`inherit`. */
function paletteColor(theme, color) {
  if (!color || color === 'default' || color === 'inherit') return null;
  return theme.palette[color]?.main ?? null;
}

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: tokens.accent, contrastText: '#14171A' },
    // One accent: `color="secondary"` resolves to the same hue rather than a
    // competing one. Distinction comes from icons and labels, not extra colour.
    secondary: { main: tokens.accent, contrastText: '#14171A' },
    success: { main: tokens.status.success, contrastText: '#14171A' },
    warning: { main: tokens.status.warning, contrastText: '#14171A' },
    error: { main: tokens.status.error, contrastText: '#14171A' },
    info: { main: tokens.status.info, contrastText: '#14171A' },
    background: {
      default: tokens.backdrop.base,
      paper: tokens.surface.glass,
    },
    text: {
      primary: tokens.text.primary,
      secondary: tokens.text.secondary,
      disabled: tokens.text.disabled,
    },
    divider: tokens.hairline,
  },

  shape: { borderRadius: tokens.radius.md },

  typography: {
    fontFamily: FONT_STACK,
    h4: { fontFamily: DISPLAY_STACK, fontSize: '1.75rem', fontWeight: 600, letterSpacing: '-0.02em' },
    h5: { fontFamily: DISPLAY_STACK, fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.015em' },
    h6: { fontFamily: DISPLAY_STACK, fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.01em' },
    subtitle1: { fontSize: '0.9375rem', fontWeight: 550 },
    subtitle2: { fontSize: '0.8125rem', fontWeight: 600, color: tokens.text.secondary },
    body1: { fontSize: '0.9375rem' },
    body2: { fontSize: '0.8125rem' },
    caption: { fontSize: '0.75rem' },
    button: { fontWeight: 550, letterSpacing: 0 },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
        body: {
          backgroundColor: tokens.backdrop.base,
          overflow: 'hidden',
        },
        '::selection': { background: alpha(tokens.accent, 0.32) },
        // Thin overlay scrollbars — a large part of the macOS impression.
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
        '*::-webkit-scrollbar-corner': { background: 'transparent' },
        '*::-webkit-scrollbar-thumb': {
          background: 'rgba(255, 255, 255, 0.18)',
          borderRadius: 8,
          border: '3px solid transparent',
          backgroundClip: 'content-box',
        },
        '*::-webkit-scrollbar-thumb:hover': {
          background: 'rgba(255, 255, 255, 0.30)',
          backgroundClip: 'content-box',
          border: '3px solid transparent',
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*': {
            animationDuration: '0.01ms !important',
            transitionDuration: '0.01ms !important',
          },
        },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: glassSurface(),
        outlined: { boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)' },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: tokens.radius.sm + 2,
          boxShadow: 'none',
          paddingInline: 16,
          transition: transition(),
          '&:hover': { boxShadow: 'none' },
        },
        sizeLarge: { paddingInline: 22, paddingBlock: 9, fontSize: '0.9375rem' },
        contained: ({ theme: t, ownerState }) => {
          const main = paletteColor(t, ownerState.color) ?? tokens.accent;
          return {
            background: main,
            color: '#14171A',
            '&:hover': { background: alpha(main, 0.86) },
            '&.Mui-disabled': {
              background: tokens.surface.glassLo,
              color: tokens.text.disabled,
            },
          };
        },
        outlined: {
          borderColor: tokens.hairlineStrong,
          color: tokens.text.primary,
          background: tokens.surface.glassLo,
          '&:hover': {
            borderColor: tokens.hairlineStrong,
            background: tokens.surface.glassHi,
          },
        },
        text: {
          color: tokens.text.secondary,
          '&:hover': { background: tokens.surface.glassLo, color: tokens.text.primary },
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          color: tokens.text.secondary,
          borderRadius: tokens.radius.sm,
          transition: transition(),
          '&:hover': { background: tokens.surface.glassHi, color: tokens.text.primary },
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          background: tokens.surface.glassLo,
          borderRadius: tokens.radius.sm + 2,
          transition: transition(['background-color', 'box-shadow']),
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.hairline,
            transition: transition(['border-color']),
          },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tokens.hairlineStrong },
          '&.Mui-focused': {
            background: tokens.surface.glass,
            boxShadow: `0 0 0 3px ${tokens.accentSofter}`,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderWidth: 1,
            borderColor: alpha(tokens.accent, 0.55),
          },
        },
        input: { padding: '12px 14px' },
        inputSizeSmall: { padding: '8px 12px' },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: tokens.text.secondary,
          '&.Mui-focused': { color: tokens.accent },
        },
      },
    },

    MuiFormHelperText: {
      styleOverrides: {
        root: { marginLeft: 2, marginTop: 6, fontSize: '0.75rem', color: tokens.text.secondary },
      },
    },

    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: tokens.text.disabled,
          borderRadius: tokens.radius.sm,
          '&.Mui-checked': { color: tokens.accent },
          '&:hover': { background: tokens.surface.glassLo },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: ({ theme: t, ownerState }) => {
          const main = paletteColor(t, ownerState.color);
          const outlined = ownerState.variant === 'outlined';

          if (!main) {
            return {
              borderRadius: tokens.radius.sm - 2,
              fontWeight: 550,
              fontSize: '0.75rem',
              background: outlined ? 'transparent' : tokens.surface.glassLo,
              border: `1px solid ${tokens.hairline}`,
              color: tokens.text.secondary,
            };
          }

          return {
            borderRadius: tokens.radius.sm - 2,
            fontWeight: 550,
            fontSize: '0.75rem',
            background: outlined ? 'transparent' : alpha(main, 0.16),
            border: `1px solid ${alpha(main, outlined ? 0.38 : 0.24)}`,
            color: main,
            '& .MuiChip-icon': { color: main },
            '&.MuiChip-clickable:hover': { background: alpha(main, 0.24) },
          };
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: ({ theme: t, ownerState }) => {
          const main = paletteColor(t, ownerState.severity) ?? tokens.status.info;
          return {
            borderRadius: tokens.radius.md,
            background: alpha(main, 0.12),
            backdropFilter: tokens.blur.panel,
            WebkitBackdropFilter: tokens.blur.panel,
            border: `1px solid ${alpha(main, 0.28)}`,
            color: tokens.text.primary,
            '& .MuiAlert-icon': { color: main },
          };
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          ...glassSurface({ radius: tokens.radius.sm, background: 'rgba(28, 32, 36, 0.92)' }),
          fontSize: '0.75rem',
          padding: '6px 10px',
          color: tokens.text.primary,
        },
        arrow: { color: 'rgba(28, 32, 36, 0.92)' },
      },
    },

    MuiAccordion: {
      defaultProps: { disableGutters: true, elevation: 0 },
      styleOverrides: {
        root: {
          ...glassSurface(),
          marginBottom: 12,
          overflow: 'hidden',
          '&::before': { display: 'none' },
          '&.Mui-expanded': { marginBottom: 12 },
        },
      },
    },

    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          minHeight: 56,
          padding: '0 20px',
          transition: transition(['background-color']),
          '&:hover': { background: tokens.surface.glassLo },
        },
        content: { margin: '14px 0' },
        expandIconWrapper: { color: tokens.text.secondary },
      },
    },

    MuiAccordionDetails: {
      styleOverrides: { root: { padding: '4px 20px 20px' } },
    },

    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${tokens.hairline}` },
        head: {
          background: 'rgba(20, 23, 26, 0.82)',
          backdropFilter: tokens.blur.bar,
          WebkitBackdropFilter: tokens.blur.bar,
          color: tokens.text.secondary,
          fontWeight: 600,
          fontSize: '0.6875rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        },
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: transition(['background-color']),
          '&.MuiTableRow-hover:hover': { background: tokens.surface.glassLo },
        },
      },
    },

    MuiTableSortLabel: {
      styleOverrides: {
        root: {
          '&.Mui-active': { color: tokens.accent },
          '&.Mui-active .MuiTableSortLabel-icon': { color: `${tokens.accent} !important` },
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 3, borderRadius: 999, background: tokens.surface.glassHi },
        bar: { borderRadius: 999, background: tokens.accent },
      },
    },

    MuiSlider: {
      styleOverrides: {
        root: { color: tokens.accent },
        rail: { background: tokens.surface.glassHi, opacity: 1 },
        thumb: {
          '&:hover, &.Mui-focusVisible': { boxShadow: `0 0 0 6px ${tokens.accentSofter}` },
        },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: glassSurface({ radius: tokens.radius.md, blur: tokens.blur.bar, background: 'rgba(28, 32, 36, 0.88)' }),
        list: { padding: 6 },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.sm - 2,
          fontSize: '0.875rem',
          transition: transition(['background-color']),
          '&.Mui-selected': { background: tokens.accentSoft, color: tokens.accent },
          '&.Mui-selected:hover': { background: tokens.accentSoft },
        },
      },
    },

    MuiPopover: {
      styleOverrides: {
        paper: glassSurface({ radius: tokens.radius.md, blur: tokens.blur.bar, background: 'rgba(28, 32, 36, 0.88)' }),
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.sm,
          transition: transition(),
          '&.Mui-selected': { background: tokens.accentSoft },
          '&.Mui-selected:hover': { background: tokens.accentSoft },
        },
      },
    },

    MuiDivider: {
      styleOverrides: { root: { borderColor: tokens.hairline } },
    },

    MuiStepConnector: {
      styleOverrides: {
        line: { borderColor: tokens.hairline },
      },
    },

    MuiSnackbarContent: {
      styleOverrides: { root: glassSurface({ radius: tokens.radius.md }) },
    },

    MuiCircularProgress: {
      styleOverrides: { root: { color: tokens.accent } },
    },
  },
});

export { tokens, glassSurface, sunkenSurface };
export default theme;
