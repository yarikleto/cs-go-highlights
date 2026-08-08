import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import CommandField from './CommandField';

function CommandFieldsPanel({
  title,
  fields = [],
  values,
  onChange,
  onBrowse,
  parseNumberValue,
}) {
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography
        sx={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: 'text.disabled',
          mb: 2.5,
        }}
      >
        {title}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {fields.map((field) => (
          <CommandField
            key={field.name}
            field={field}
            value={values[field.name]}
            values={values}
            onChange={onChange}
            onBrowse={onBrowse}
            parseNumberValue={parseNumberValue}
          />
        ))}
      </Box>
    </Paper>
  );
}

export default CommandFieldsPanel;
