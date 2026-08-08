import { Box, Typography } from '@mui/material';
import { keyframes } from '@emotion/react';
import { tokens } from '../../theme/tokens';

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.78); }
`;

/**
 * Draggable glass strip standing in for the native title bar.
 *
 * Windows still draws its own caption buttons on the right (titleBarOverlay),
 * so the content is constrained to `titlebar-area-width` to stay clear of them.
 */
function TitleBar({ runningLabel }) {
  return (
    <Box
      component="header"
      sx={{
        position: 'relative',
        zIndex: 3,
        flexShrink: 0,
        height: tokens.titleBarHeight,
        background: 'rgba(255, 255, 255, 0.04)',
        backdropFilter: tokens.blur.bar,
        WebkitBackdropFilter: tokens.blur.bar,
        borderBottom: `1px solid ${tokens.hairline}`,
        WebkitAppRegion: 'drag',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          height: '100%',
          width: 'env(titlebar-area-width, 100%)',
          pl: 2,
          pr: 1.5,
        }}
      >
        <Box
          sx={{
            width: 18,
            height: 18,
            borderRadius: '4px',
            flexShrink: 0,
            background: `linear-gradient(140deg, ${tokens.accent}, #B4741F)`,
            boxShadow: `0 0 12px ${tokens.accentSoft}`,
          }}
        />
        <Typography
          sx={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: tokens.text.primary,
          }}
        >
          CS:GO Highlights
        </Typography>

        <Box sx={{ flex: 1 }} />

        {runningLabel && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                flexShrink: 0,
                background: tokens.status.success,
                boxShadow: `0 0 8px ${tokens.status.success}`,
                animation: `${pulse} 1.6s ease-in-out infinite`,
              }}
            />
            <Typography
              noWrap
              sx={{ fontSize: '0.75rem', color: tokens.text.secondary, minWidth: 0 }}
            >
              Running {runningLabel}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default TitleBar;
