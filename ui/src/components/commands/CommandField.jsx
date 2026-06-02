import React from 'react';
import {
  Box,
  Typography,
  TextField,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  FormControl,
  FormHelperText,
  InputLabel,
  IconButton,
  InputAdornment,
} from '@mui/material';
import {
  FolderOpen as FolderIcon,
  InsertDriveFile as FileIcon,
  SaveAlt as SaveIcon,
} from '@mui/icons-material';

const defaultParseNumberValue = (value) => (value === '' ? '' : Number(value));

function getFieldLabel(field) {
  return field.label || field.name;
}

function BrowseButton({ icon, label, onClick }) {
  return (
    <InputAdornment position="end">
      <IconButton aria-label={label} onClick={onClick}>
        {icon}
      </IconButton>
    </InputAdornment>
  );
}

function CommandField({
  field,
  value,
  values = {},
  onChange,
  onBrowse,
  parseNumberValue = defaultParseNumberValue,
}) {
  const label = getFieldLabel(field);
  const fieldValue = value ?? field.default ?? '';

  const handleBrowse = (browseType) => {
    onBrowse?.(field, browseType);
  };

  if (field.type === 'folder') {
    return (
      <TextField
        label={label}
        value={fieldValue}
        onChange={(e) => onChange(field.name, e.target.value)}
        fullWidth
        required={field.required}
        helperText={field.description}
        InputProps={{
          endAdornment: (
            <BrowseButton
              icon={<FolderIcon />}
              label={`Select ${label}`}
              onClick={() => handleBrowse('folder')}
            />
          ),
        }}
      />
    );
  }

  if (field.type === 'file' || field.type === 'save-file') {
    const isSaveFile = field.type === 'save-file';

    return (
      <TextField
        label={label}
        value={fieldValue}
        onChange={(e) => onChange(field.name, e.target.value)}
        fullWidth
        required={field.required}
        helperText={field.description}
        InputProps={{
          endAdornment: (
            <BrowseButton
              icon={isSaveFile ? <SaveIcon /> : <FileIcon />}
              label={`${isSaveFile ? 'Select output for' : 'Select'} ${label}`}
              onClick={() => handleBrowse(field.type)}
            />
          ),
        }}
      />
    );
  }

  if (field.type === 'boolean') {
    const isDisabled = field.requiresOption && !values[field.requiresOption];

    return (
      <FormControlLabel
        disabled={isDisabled}
        control={
          <Checkbox
            checked={!isDisabled && !!fieldValue}
            onChange={(e) => onChange(field.name, e.target.checked)}
          />
        }
        label={
          <Box>
            <Typography color={isDisabled ? 'text.disabled' : 'text.primary'}>
              {label}
            </Typography>
            {field.description && (
              <Typography variant="caption" color={isDisabled ? 'text.disabled' : 'text.secondary'}>
                {field.description}
              </Typography>
            )}
          </Box>
        }
      />
    );
  }

  if (field.type === 'select') {
    return (
      <FormControl fullWidth required={field.required}>
        <InputLabel>{label}</InputLabel>
        <Select
          value={fieldValue}
          label={label}
          onChange={(e) => onChange(field.name, e.target.value)}
        >
          {field.choices?.map((choice) => (
            <MenuItem key={choice.value} value={choice.value}>
              {choice.label}
            </MenuItem>
          ))}
        </Select>
        {field.description && <FormHelperText>{field.description}</FormHelperText>}
      </FormControl>
    );
  }

  if (field.type === 'number') {
    return (
      <TextField
        label={label}
        type="number"
        value={fieldValue}
        onChange={(e) => onChange(field.name, parseNumberValue(e.target.value))}
        fullWidth
        required={field.required}
        helperText={field.description}
        inputProps={{
          min: field.min,
          max: field.max,
          step: field.step || 1,
        }}
      />
    );
  }

  return (
    <TextField
      label={label}
      value={fieldValue}
      onChange={(e) => onChange(field.name, e.target.value)}
      fullWidth
      required={field.required}
      helperText={field.description}
    />
  );
}

export default CommandField;
