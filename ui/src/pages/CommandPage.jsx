import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  LinearProgress,
  Alert,
  InputAdornment,
  Chip,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  FolderOpen as FolderIcon,
  InsertDriveFile as FileIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { useCommandContext } from '../context/CommandContext';

function CommandPage() {
  const { commandId } = useParams();
  const [command, setCommand] = useState(null);
  const logsEndRef = useRef(null);
  const initializedRef = useRef({});
  
  // Use context for persistent state
  const {
    getOptions,
    initializeOptions,
    updateOption,
    getLogs,
    addLog,
    clearLogs,
    getResult,
    setResult,
    runningCommand,
    setRunningCommand,
    isCommandRunning,
  } = useCommandContext();

  const options = getOptions(commandId);
  const logs = getLogs(commandId);
  const result = getResult(commandId);
  const isRunning = isCommandRunning(commandId);

  // Load command metadata and initialize defaults
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getCommands().then((commands) => {
        const cmd = commands.find((c) => c.id === commandId);
        setCommand(cmd);
        
        // Initialize options with defaults only once per command
        if (cmd && !initializedRef.current[commandId]) {
          const defaults = {};
          cmd.options?.forEach((opt) => {
            if (opt.default !== undefined) {
              defaults[opt.name] = opt.default;
            }
          });
          initializeOptions(commandId, defaults);
          initializedRef.current[commandId] = true;
        }
      });
    }
  }, [commandId, initializeOptions]);

  // Subscribe to command output
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubOutput = window.electronAPI.onCommandOutput((data) => {
      // Only add logs if this command is running
      if (runningCommand) {
        addLog(runningCommand, data);
      }
    });

    const unsubComplete = window.electronAPI.onCommandComplete((data) => {
      if (runningCommand) {
        setResult(runningCommand, data);
        setRunningCommand(null);
      }
    });

    return () => {
      unsubOutput();
      unsubComplete();
    };
  }, [runningCommand, addLog, setResult, setRunningCommand]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleOptionChange = (name, value) => {
    updateOption(commandId, name, value);

    if (command) {
      const opt = command.options?.find((o) => o.name === name);

      // Handle mutually exclusive options: if this boolean is turned on, turn off excluded options
      if (value === true && opt?.excludes) {
        opt.excludes.forEach((excludedName) => {
          updateOption(commandId, excludedName, false);
        });
      }

      // If this option is turned off, also turn off any options that require it
      if (value === false) {
        command.options?.forEach((depOpt) => {
          if (depOpt.requiresOption === name) {
            updateOption(commandId, depOpt.name, false);
          }
        });
      }
    }
  };

  const handleSelectFolder = async (name) => {
    const path = await window.electronAPI.selectFolder();
    if (path) {
      handleOptionChange(name, path);
    }
  };

  const handleSelectFile = async (name, filters) => {
    const path = await window.electronAPI.selectFile(filters);
    if (path) {
      handleOptionChange(name, path);
    }
  };

  const handleRun = async () => {
    clearLogs(commandId);
    setRunningCommand(commandId);
    
    await window.electronAPI.runCommand(commandId, options);
  };

  const handleStop = async () => {
    await window.electronAPI.stopCommand();
    setRunningCommand(null);
  };

  const handleClear = () => {
    clearLogs(commandId);
  };

  const renderOption = (opt) => {
    const value = options[opt.name] ?? opt.default ?? '';

    switch (opt.type) {
      case 'folder':
        return (
          <TextField
            key={opt.name}
            label={opt.label || opt.name}
            value={value}
            onChange={(e) => handleOptionChange(opt.name, e.target.value)}
            fullWidth
            required={opt.required}
            helperText={opt.description}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => handleSelectFolder(opt.name)}>
                    <FolderIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        );

      case 'file':
        return (
          <TextField
            key={opt.name}
            label={opt.label || opt.name}
            value={value}
            onChange={(e) => handleOptionChange(opt.name, e.target.value)}
            fullWidth
            required={opt.required}
            helperText={opt.description}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => handleSelectFile(opt.name, opt.filters)}>
                    <FileIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        );

      case 'boolean': {
        const isDisabled = opt.requiresOption && !options[opt.requiresOption];
        return (
          <FormControlLabel
            key={opt.name}
            disabled={isDisabled}
            control={
              <Checkbox
                checked={!isDisabled && !!value}
                onChange={(e) => handleOptionChange(opt.name, e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography color={isDisabled ? 'text.disabled' : 'text.primary'}>{opt.label || opt.name}</Typography>
                {opt.description && (
                  <Typography variant="caption" color={isDisabled ? 'text.disabled' : 'text.secondary'}>
                    {opt.description}
                  </Typography>
                )}
              </Box>
            }
          />
        );
      }

      case 'select':
        return (
          <FormControl key={opt.name} fullWidth>
            <InputLabel>{opt.label || opt.name}</InputLabel>
            <Select
              value={value}
              label={opt.label || opt.name}
              onChange={(e) => handleOptionChange(opt.name, e.target.value)}
            >
              {opt.choices?.map((choice) => (
                <MenuItem key={choice.value} value={choice.value}>
                  {choice.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );

      case 'number':
        return (
          <TextField
            key={opt.name}
            label={opt.label || opt.name}
            type="number"
            value={value}
            onChange={(e) => handleOptionChange(opt.name, parseFloat(e.target.value))}
            fullWidth
            helperText={opt.description}
            inputProps={{
              min: opt.min,
              max: opt.max,
              step: opt.step || 1,
            }}
          />
        );

      default: // text
        return (
          <TextField
            key={opt.name}
            label={opt.label || opt.name}
            value={value}
            onChange={(e) => handleOptionChange(opt.name, e.target.value)}
            fullWidth
            required={opt.required}
            helperText={opt.description}
          />
        );
    }
  };

  if (!command) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4" fontWeight="bold">
            {command.name}
          </Typography>
          <Chip label={command.category} size="small" color="primary" variant="outlined" />
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          {command.description}
        </Typography>
      </Box>

      {/* Options */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Options
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {command.options?.map(renderOption)}
        </Box>
      </Paper>

      {/* Run Button */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        {!isRunning ? (
          <Button
            variant="contained"
            size="large"
            startIcon={<PlayIcon />}
            onClick={handleRun}
            disabled={runningCommand !== null}
          >
            Run {command.name}
          </Button>
        ) : (
          <Button
            variant="contained"
            color="error"
            size="large"
            startIcon={<StopIcon />}
            onClick={handleStop}
          >
            Stop
          </Button>
        )}
        
        {logs.length > 0 && !isRunning && (
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleClear}
          >
            Clear Logs
          </Button>
        )}
        
        {runningCommand && runningCommand !== commandId && (
          <Typography color="warning.main" sx={{ alignSelf: 'center' }}>
            Another command is running...
          </Typography>
        )}
      </Box>

      {/* Progress */}
      {isRunning && <LinearProgress sx={{ mb: 2 }} />}

      {/* Result */}
      {result && (
        <Alert 
          severity={result.success ? 'success' : 'error'} 
          sx={{ mb: 2 }}
        >
          {result.success 
            ? 'Command completed successfully!' 
            : `Command failed with exit code ${result.code}`
          }
          {result.error && `: ${result.error}`}
        </Alert>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <Paper
          sx={{
            flex: 1,
            minHeight: 200,
            overflow: 'auto',
            bgcolor: '#0d0d0d',
            p: 2,
            fontFamily: 'monospace',
            fontSize: '0.85rem',
          }}
        >
          {logs.map((log, i) => (
            <Box
              key={i}
              component="pre"
              sx={{
                m: 0,
                color: log.type === 'stderr' ? '#ff6b6b' : '#e0e0e0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {log.text}
            </Box>
          ))}
          <div ref={logsEndRef} />
        </Paper>
      )}
    </Box>
  );
}

export default CommandPage;
