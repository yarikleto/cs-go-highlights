import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  IconButton,
  InputAdornment,
  LinearProgress,
  Alert,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  InsertDriveFile as FileIcon,
  Clear as ClearIcon,
  CheckCircle as DoneIcon,
  Error as ErrorIcon,
  RadioButtonUnchecked as PendingIcon,
} from '@mui/icons-material';

function FlowPage() {
  const { flowId } = useParams();
  const [flow, setFlow] = useState(null);
  const [params, setParams] = useState({});
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [stepStatuses, setStepStatuses] = useState([]);
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const logsEndRef = useRef(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getFlows().then((flows) => {
      const f = flows.find((fl) => fl.id === flowId);
      setFlow(f);
      if (f) {
        const defaults = {};
        f.params?.forEach((p) => {
          if (p.default !== undefined) defaults[p.name] = p.default;
        });
        setParams(defaults);
        setStepStatuses(f.steps.map(() => 'pending'));
      }
    });
  }, [flowId]);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubs = [
      window.electronAPI.onFlowStepStart((data) => {
        setCurrentStep(data.index);
        setStepStatuses((prev) => {
          const next = [...prev];
          next[data.index] = 'running';
          return next;
        });
        setLogs((prev) => [...prev, { type: 'step-header', text: `\n━━━ Step ${data.index + 1}/${data.total}: ${data.name} ━━━\n` }]);
      }),
      window.electronAPI.onFlowOutput((data) => {
        setLogs((prev) => [...prev, data]);
      }),
      window.electronAPI.onFlowStepComplete((data) => {
        setStepStatuses((prev) => {
          const next = [...prev];
          next[data.index] = data.success ? 'done' : 'failed';
          return next;
        });
      }),
      window.electronAPI.onFlowComplete((data) => {
        setRunning(false);
        setCurrentStep(-1);
        setResult(data);
      }),
    ];

    return () => unsubs.forEach((fn) => fn());
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleParamChange = (name, value) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectFile = async (name, filters) => {
    const path = await window.electronAPI.selectFile(filters);
    if (path) handleParamChange(name, path);
  };

  const handleRun = async () => {
    setLogs([]);
    setResult(null);
    setStepStatuses(flow.steps.map(() => 'pending'));
    setCurrentStep(-1);
    setRunning(true);
    await window.electronAPI.runFlow(flowId, params);
  };

  const handleStop = async () => {
    await window.electronAPI.stopFlow();
  };

  const handleClear = () => {
    setLogs([]);
    setResult(null);
    setStepStatuses(flow?.steps.map(() => 'pending') || []);
    setCurrentStep(-1);
  };

  const canRun = () => {
    if (!flow) return false;
    for (const p of flow.params || []) {
      if (p.required && !params[p.name]) return false;
    }
    return true;
  };

  const renderParam = (param) => {
    const value = params[param.name] ?? '';

    if (param.type === 'file') {
      return (
        <TextField
          key={param.name}
          label={param.label || param.name}
          value={value}
          onChange={(e) => handleParamChange(param.name, e.target.value)}
          fullWidth
          required={param.required}
          helperText={param.description}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => handleSelectFile(param.name, param.filters)}>
                  <FileIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      );
    }

    return (
      <TextField
        key={param.name}
        label={param.label || param.name}
        value={value}
        onChange={(e) => handleParamChange(param.name, e.target.value)}
        fullWidth
        required={param.required}
        helperText={param.description}
      />
    );
  };

  const getStepIcon = (status) => {
    switch (status) {
      case 'done': return <DoneIcon color="success" fontSize="small" />;
      case 'failed': return <ErrorIcon color="error" fontSize="small" />;
      case 'running': return null;
      default: return <PendingIcon sx={{ color: 'text.disabled' }} fontSize="small" />;
    }
  };

  if (!flow) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  const completedSteps = stepStatuses.filter((s) => s === 'done').length;
  const progress = flow.steps.length > 0 ? (completedSteps / flow.steps.length) * 100 : 0;

  return (
    <Box sx={{ p: 4, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4" fontWeight="bold">
            {flow.name}
          </Typography>
          <Chip label="Flow" size="small" color="secondary" variant="outlined" />
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          {flow.description}
        </Typography>
      </Box>

      {/* Params */}
      {flow.params?.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Parameters
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {flow.params.map(renderParam)}
          </Box>
        </Paper>
      )}

      {/* Steps overview */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Steps ({completedSteps}/{flow.steps.length})
        </Typography>
        {running && (
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ mb: 2, height: 6, borderRadius: 3 }}
          />
        )}
        <Stepper
          activeStep={currentStep}
          orientation="vertical"
          sx={{
            '& .MuiStepConnector-line': { minHeight: 12 },
          }}
        >
          {flow.steps.map((step, i) => (
            <Step key={i} completed={stepStatuses[i] === 'done'}>
              <StepLabel
                error={stepStatuses[i] === 'failed'}
                icon={getStepIcon(stepStatuses[i])}
                sx={{
                  '& .MuiStepLabel-label': {
                    fontWeight: stepStatuses[i] === 'running' ? 'bold' : 'normal',
                  },
                }}
              >
                {step.name}
                {stepStatuses[i] === 'running' && (
                  <LinearProgress sx={{ mt: 0.5, width: 120, height: 3, borderRadius: 2 }} />
                )}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {/* Run / Stop */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        {!running ? (
          <Button
            variant="contained"
            size="large"
            startIcon={<PlayIcon />}
            onClick={handleRun}
            disabled={!canRun()}
          >
            Run Flow
          </Button>
        ) : (
          <Button
            variant="contained"
            color="error"
            size="large"
            startIcon={<StopIcon />}
            onClick={handleStop}
          >
            Stop Flow
          </Button>
        )}

        {logs.length > 0 && !running && (
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleClear}
          >
            Clear
          </Button>
        )}
      </Box>

      {/* Result */}
      {result && (
        <Alert
          severity={result.success ? 'success' : 'error'}
          sx={{ mb: 2 }}
        >
          {result.success
            ? 'Flow completed successfully!'
            : result.error || 'Flow failed'}
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
                color:
                  log.type === 'step-header'
                    ? '#64b5f6'
                    : log.type === 'stderr'
                    ? '#ff6b6b'
                    : '#e0e0e0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontWeight: log.type === 'step-header' ? 'bold' : 'normal',
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

export default FlowPage;
