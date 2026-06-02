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
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
