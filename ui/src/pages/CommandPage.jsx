import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  LinearProgress,
  Alert,
  Chip,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import CommandFieldsPanel from '../components/commands/CommandFieldsPanel';
import ExecutionOutput from '../components/commands/ExecutionOutput';
import { useCommandContext } from '../context/CommandContext';
import { useElectronApi } from '../hooks/commands/useElectronApi';

function formatCommandResult(result) {
  if (result.success) return 'Command completed successfully!';

  const baseMessage = result.code === null || result.code === undefined
    ? 'Command failed'
    : `Command failed with exit code ${result.code}`;

  return result.error ? `${baseMessage}: ${result.error}` : baseMessage;
}

function parseCommandNumber(value) {
  return value === '' ? '' : parseFloat(value);
}

function CommandPage() {
  const { commandId } = useParams();
  const [command, setCommand] = useState(null);
  const logsEndRef = useRef(null);
  const initializedRef = useRef({});
  const runningCommandRef = useRef(null);
  const {
    apiError,
    setApiError,
    clearApiError,
    getApi,
    handleApiError,
    callApi,
  } = useElectronApi();
  
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
  const showApiError = apiError && apiError !== result?.error;

  // Load command metadata and initialize defaults
  useEffect(() => {
    let isMounted = true;

    const loadCommand = async () => {
      setCommand(null);
      const commands = await callApi((api) => api.getCommands(), 'Failed to load commands');
      if (!isMounted || !commands) return;

      const cmd = commands.find((c) => c.id === commandId);
      if (!cmd) {
        setApiError(`Command "${commandId}" was not found.`);
        return;
      }

      clearApiError();
      setCommand(cmd);

      // Initialize options with defaults only once per command
      if (!initializedRef.current[commandId]) {
        const defaults = {};
        cmd.options?.forEach((opt) => {
          if (opt.default !== undefined) {
            defaults[opt.name] = opt.default;
          }
        });
        initializeOptions(commandId, defaults);
        initializedRef.current[commandId] = true;
      }
    };

    loadCommand();

    return () => {
      isMounted = false;
    };
  }, [commandId, initializeOptions, callApi, clearApiError, setApiError]);

  useEffect(() => {
    runningCommandRef.current = runningCommand;
  }, [runningCommand]);

  // Subscribe to command output
  useEffect(() => {
    const api = getApi('Electron API is unavailable. Command output cannot be received.');
    if (!api) return undefined;

    try {
      const unsubOutput = api.onCommandOutput((data) => {
        const activeCommand = runningCommandRef.current;

        if (activeCommand) {
          addLog(activeCommand, data);
        }
      });

      const unsubComplete = api.onCommandComplete((data) => {
        const activeCommand = runningCommandRef.current;

        if (activeCommand) {
          setResult(activeCommand, data);
          runningCommandRef.current = null;
          setRunningCommand(null);
        }
      });

      return () => {
        unsubOutput?.();
        unsubComplete?.();
      };
    } catch (error) {
      handleApiError(error, 'Failed to subscribe to command output');
      return undefined;
    }
  }, [addLog, setResult, setRunningCommand, getApi, handleApiError]);

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

  const handleBrowse = async (field, browseType) => {
    const fallback = `Failed to select ${field.label || field.name}`;
    const path = await callApi((api) => {
      if (browseType === 'folder') return api.selectFolder();
      if (browseType === 'save-file') return api.selectSaveFile(field.filters);
      return api.selectFile(field.filters);
    }, fallback);

    if (path) {
      handleOptionChange(field.name, path);
    }
  };

  const handleRun = async () => {
    const api = getApi();
    if (!api) return;

    clearApiError();
    clearLogs(commandId);
    runningCommandRef.current = commandId;
    setRunningCommand(commandId);

    try {
      const response = await api.runCommand(commandId, options);
      if (!response?.started) {
        throw new Error(response?.error || 'Command did not start');
      }
    } catch (error) {
      const message = handleApiError(error, 'Failed to start command');
      setResult(commandId, { success: false, code: null, error: message });
      runningCommandRef.current = null;
      setRunningCommand(null);
    }
  };

  const handleStop = async () => {
    const stopped = await callApi((api) => api.stopCommand(), 'Failed to stop command');
    if (stopped !== null) {
      runningCommandRef.current = null;
      setRunningCommand(null);
    }
  };

  const handleClear = () => {
    clearLogs(commandId);
    clearApiError();
  };

  if (!command) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Loading...</Typography>
        {apiError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {apiError}
          </Alert>
        )}
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

      {showApiError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {apiError}
        </Alert>
      )}

      {/* Options */}
      <CommandFieldsPanel
        title="Options"
        fields={command.options || []}
        values={options}
        onChange={handleOptionChange}
        onBrowse={handleBrowse}
        parseNumberValue={parseCommandNumber}
      />

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

      <ExecutionOutput
        result={result}
        logs={logs}
        logsEndRef={logsEndRef}
        formatResult={formatCommandResult}
      />
    </Box>
  );
}

export default CommandPage;
