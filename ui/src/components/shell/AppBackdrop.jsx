import { Box } from '@mui/material';
import { tokens } from '../../theme/tokens';

/**
 * The painted "wallpaper" every glass surface blurs against.
 *
 * Fixed and static — no animation, so it never costs a repaint during
 * playback or log streaming.
 */
function AppBackdrop() {
  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        backgroundColor: tokens.backdrop.base,
        backgroundImage: [
          ...tokens.backdrop.washes,
          `linear-gradient(160deg, ${tokens.backdrop.base} 0%, ${tokens.backdrop.end} 100%)`,
        ].join(', '),
      }}
    />
  );
}

export default AppBackdrop;
