import React from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Typography,
  TextField,
  IconButton,
  InputAdornment,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  FolderOpen as FolderIcon,
  InsertDriveFile as FileIcon,
} from '@mui/icons-material';

const getFieldValue = (configSection, field) => {
  const value = configSection?.[field.name];
  return value ?? field.defaultValue ?? '';
};

const parseNumberValue = (value, numberType) => {
  if (value === '') {
    return undefined;
  }

  const parsed = numberType === 'int'
    ? parseInt(value, 10)
    : parseFloat(value);

  return Number.isNaN(parsed) ? undefined : parsed;
};

function ConfigField({
  field,
  sectionId,
  configSection,
  onFieldChange,
  onSelectFolder,
  onSelectFile,
}) {
  const value = getFieldValue(configSection, field);

  if (field.type === 'checkbox') {
    return (
      <FormControlLabel
        control={
          <Checkbox
            checked={Boolean(value)}
            onChange={(e) => onFieldChange(sectionId, field.name, e.target.checked)}
          />
        }
        label={field.label}
      />
    );
  }

  const handleChange = (event) => {
    const nextValue = field.type === 'number'
      ? parseNumberValue(event.target.value, field.numberType)
      : event.target.value;

    onFieldChange(sectionId, field.name, nextValue);
  };

  const selectButton = field.type === 'folder' || field.type === 'file'
    ? (
      <InputAdornment position="end">
        <IconButton
          aria-label={`Select ${field.label}`}
          onClick={() => (
            field.type === 'folder'
              ? onSelectFolder(sectionId, field.name)
              : onSelectFile(sectionId, field.name)
          )}
        >
          {field.type === 'folder' ? <FolderIcon /> : <FileIcon />}
        </IconButton>
      </InputAdornment>
    )
    : null;

  return (
    <TextField
      label={field.label}
      type={field.type === 'number' ? 'number' : undefined}
      value={value}
      onChange={handleChange}
      fullWidth
      helperText={field.helperText}
      inputProps={field.inputProps}
      InputProps={selectButton ? { endAdornment: selectButton } : undefined}
    />
  );
}

function ConfigSection({
  section,
  config,
  expanded,
  onAccordionChange,
  onFieldChange,
  onSelectFolder,
  onSelectFile,
}) {
  const configSection = config?.[section.id] ?? {};

  return (
    <Accordion
      expanded={expanded}
      onChange={onAccordionChange(section.id)}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6">{section.title}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Grid container spacing={2}>
          {section.fields.map((field) => (
            <Grid
              item
              key={field.name}
              xs={field.grid?.xs ?? 12}
              md={field.grid?.md ?? 6}
            >
              <ConfigField
                field={field}
                sectionId={section.id}
                configSection={configSection}
                onFieldChange={onFieldChange}
                onSelectFolder={onSelectFolder}
                onSelectFile={onSelectFile}
              />
            </Grid>
          ))}
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
}

export default ConfigSection;
