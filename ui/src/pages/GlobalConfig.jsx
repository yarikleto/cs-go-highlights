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
import PageHeader from '../components/shell/PageHeader';

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
        <Typography color="text.secondary">Loading config…</Typography>
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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header stays put while the sections scroll underneath. */}
      <Box sx={{ flexShrink: 0, px: 4, pt: 4, pb: 2.5 }}>
        <Box sx={{ maxWidth: 1400 }}>
          <PageHeader
            sx={{ mb: 0, alignItems: 'center' }}
            title="Global Configuration"
            subtitle="Default values for all commands. These can be overridden per-command."
            actions={
              <>
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
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </>
            }
          />
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 4, pb: 4 }}>
        <Box sx={{ maxWidth: 1400 }}>
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
        </Box>
      </Box>

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
