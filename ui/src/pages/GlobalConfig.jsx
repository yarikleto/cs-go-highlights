import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Divider,
  Alert,
  Snackbar,
  IconButton,
  InputAdornment,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  FolderOpen as FolderIcon,
  InsertDriveFile as FileIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';

function GlobalConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [expanded, setExpanded] = useState(['paths', 'detection']);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const cfg = await window.electronAPI.getConfig();
      setConfig(cfg);
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to load config', severity: 'error' });
    }
    setLoading(false);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const result = await window.electronAPI.saveConfig(config);
      if (result.success) {
        setSnackbar({ open: true, message: 'Config saved successfully!', severity: 'success' });
      } else {
        throw new Error(result.error);
      }
    } catch (e) {
      setSnackbar({ open: true, message: `Failed to save: ${e.message}`, severity: 'error' });
    }
    setSaving(false);
  };

  const handleChange = (section, key, value) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
  };

  const handleSelectFolder = async (section, key) => {
    const path = await window.electronAPI.selectFolder();
    if (path) {
      handleChange(section, key, path);
    }
  };

  const handleSelectFile = async (section, key) => {
    const path = await window.electronAPI.selectFile();
    if (path) {
      handleChange(section, key, path);
    }
  };

  const handleAccordion = (panel) => (event, isExpanded) => {
    if (isExpanded) {
      setExpanded((prev) => [...prev, panel]);
    } else {
      setExpanded((prev) => prev.filter((p) => p !== panel));
    }
  };

  if (loading || !config) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Loading config...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Global Configuration
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Default values for all commands. These can be overridden per-command.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadConfig}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={saveConfig}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Box>
      </Box>

      {/* Paths Section */}
      <Accordion 
        expanded={expanded.includes('paths')} 
        onChange={handleAccordion('paths')}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Paths</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Demos Folder"
                value={config.paths?.demos || ''}
                onChange={(e) => handleChange('paths', 'demos', e.target.value)}
                fullWidth
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => handleSelectFolder('paths', 'demos')}>
                        <FolderIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Output Folder"
                value={config.paths?.output || ''}
                onChange={(e) => handleChange('paths', 'output', e.target.value)}
                fullWidth
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => handleSelectFolder('paths', 'output')}>
                        <FolderIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="HLAE Executable"
                value={config.paths?.hlae || ''}
                onChange={(e) => handleChange('paths', 'hlae', e.target.value)}
                fullWidth
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => handleSelectFile('paths', 'hlae')}>
                        <FileIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="CS:GO Folder"
                value={config.paths?.csgo || ''}
                onChange={(e) => handleChange('paths', 'csgo', e.target.value)}
                fullWidth
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => handleSelectFolder('paths', 'csgo')}>
                        <FolderIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Detection Section */}
      <Accordion 
        expanded={expanded.includes('detection')} 
        onChange={handleAccordion('detection')}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Detection</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                label="Max Delay Between Kills (s)"
                type="number"
                value={config.detection?.maxDelay || 15}
                onChange={(e) => handleChange('detection', 'maxDelay', parseInt(e.target.value))}
                fullWidth
                helperText="Maximum seconds between kills for a series"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Min Series Kills"
                type="number"
                value={config.detection?.minSeriesKills || 3}
                onChange={(e) => handleChange('detection', 'minSeriesKills', parseInt(e.target.value))}
                fullWidth
                helperText="Minimum kills for a kill series"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Min Clutch Enemies"
                type="number"
                value={config.detection?.minEnemies || 2}
                onChange={(e) => handleChange('detection', 'minEnemies', parseInt(e.target.value))}
                fullWidth
                helperText="Minimum enemies for clutch detection"
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Padding Section */}
      <Accordion 
        expanded={expanded.includes('padding')} 
        onChange={handleAccordion('padding')}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Padding</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Padding Before (s)"
                type="number"
                value={config.padding?.before || 4}
                onChange={(e) => handleChange('padding', 'before', parseInt(e.target.value))}
                fullWidth
                helperText="Seconds before highlight starts"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Padding After (s)"
                type="number"
                value={config.padding?.after || 5}
                onChange={(e) => handleChange('padding', 'after', parseInt(e.target.value))}
                fullWidth
                helperText="Seconds after highlight ends"
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Speedup Section */}
      <Accordion 
        expanded={expanded.includes('speedup')} 
        onChange={handleAccordion('speedup')}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Speedup</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                label="Start Delay (s)"
                type="number"
                value={config.speedup?.startDelay || 2}
                onChange={(e) => handleChange('speedup', 'startDelay', parseInt(e.target.value))}
                fullWidth
                helperText="Delay before first speedup"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Buffer Around Kills (s)"
                type="number"
                value={config.speedup?.bufferAroundKills || 2}
                onChange={(e) => handleChange('speedup', 'bufferAroundKills', parseInt(e.target.value))}
                fullWidth
                helperText="Normal speed buffer around action"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Min Gap Duration (s)"
                type="number"
                value={config.speedup?.minGapDuration || 4}
                onChange={(e) => handleChange('speedup', 'minGapDuration', parseInt(e.target.value))}
                fullWidth
                helperText="Minimum gap to apply speedup"
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Slowmo Section */}
      <Accordion 
        expanded={expanded.includes('slowmo')} 
        onChange={handleAccordion('slowmo')}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Slow Motion</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Duration (s)"
                type="number"
                value={config.slowmo?.duration || 1}
                onChange={(e) => handleChange('slowmo', 'duration', parseFloat(e.target.value))}
                fullWidth
                inputProps={{ step: 0.1 }}
                helperText="Slowmo effect duration"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Slowmo Factor"
                type="number"
                value={config.slowmo?.factor || 0.6}
                onChange={(e) => handleChange('slowmo', 'factor', parseFloat(e.target.value))}
                fullWidth
                inputProps={{ step: 0.1, min: 0.1, max: 1 }}
                helperText="Speed factor (0.6 = 60% speed)"
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Postprocess Section */}
      <Accordion 
        expanded={expanded.includes('postprocess')} 
        onChange={handleAccordion('postprocess')}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Postprocess</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Speedup Multiplier"
                type="number"
                value={config.postprocess?.speedupMultiplier || 3}
                onChange={(e) => handleChange('postprocess', 'speedupMultiplier', parseInt(e.target.value))}
                fullWidth
                helperText="Speed multiplier for gaps"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={config.postprocess?.showOverlay ?? true}
                    onChange={(e) => handleChange('postprocess', 'showOverlay', e.target.checked)}
                  />
                }
                label="Show Overlay (player name, highlight type)"
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default GlobalConfig;
