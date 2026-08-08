import { Box, Typography } from '@mui/material';

/** Shared page title block: title + optional chip, subtitle and right-side actions. */
function PageHeader({ title, subtitle, chip, actions, sx }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3, ...sx }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="h4">{title}</Typography>
          {chip}
        </Box>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1.5, flexShrink: 0 }}>{actions}</Box>}
    </Box>
  );
}

export default PageHeader;
