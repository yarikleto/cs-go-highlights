import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import ConfigSection from '../components/config/ConfigSection';
import { CONFIG_SECTIONS } from '../components/config/configSections';

function GlobalConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [expanded, setExpanded] = useState(['paths', 'detection']);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    try {
      const cfg = await window.electronAPI.getConfig();
      setConfig(cfg);
    } catch (e) {
      const message = e.message ? `Failed to load config: ${e.message}` : 'Failed to load config';
      setLoadError(message);
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const saveConfig = async () => {
    if (!config) {
      return;
    }

    setSaving(true);

    try {
      const result = await window.electronAPI.saveConfig(config);
      if (result?.success) {
        setSnackbar({ open: true, message: 'Config saved successfully!', severity: 'success' });
      } else {
        throw new Error(result?.error || 'Unknown save error');
      }
    } catch (e) {
      const message = e.message ? `Failed to save: ${e.message}` : 'Failed to save config';
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (section, key, value) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] ?? {}),
        [key]: value,
      },
    }));
  };

  const handleSelectFolder = async (section, key) => {
    try {
      const path = await window.electronAPI.selectFolder();
      if (path) {
        handleChange(section, key, path);
      }
    } catch (e) {
      const message = e.message ? `Failed to select folder: ${e.message}` : 'Failed to select folder';
      setSnackbar({ open: true, message, severity: 'error' });
    }
  };

  const handleSelectFile = async (section, key) => {
    try {
      const path = await window.electronAPI.selectFile();
      if (path) {
        handleChange(section, key, path);
      }
    } catch (e) {
      const message = e.message ? `Failed to select file: ${e.message}` : 'Failed to select file';
      setSnackbar({ open: true, message, severity: 'error' });
    }
  };

  const handleAccordion = (panel) => (event, isExpanded) => {
    if (isExpanded) {
      setExpanded((prev) => [...prev, panel]);
    } else {
      setExpanded((prev) => prev.filter((p) => p !== panel));
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Loading config...</Typography>
      </Box>
    );
  }

  if (!config) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={loadConfig}
            >
              Retry
            </Button>
          }
        >
          {loadError || 'Failed to load config'}
        </Alert>
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
            disabled={loading || saving}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={saveConfig}
            disabled={saving || loading}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Box>
      </Box>

      {CONFIG_SECTIONS.map((section) => (
        <ConfigSection
          key={section.id}
          section={section}
          config={config}
          expanded={expanded.includes(section.id)}
          onAccordionChange={handleAccordion}
          onFieldChange={handleChange}
          onSelectFolder={handleSelectFolder}
          onSelectFile={handleSelectFile}
        />
      ))}

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
