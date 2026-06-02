import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  LinearProgress,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Chip,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Clear as ClearIcon,
  CheckCircle as DoneIcon,
  Error as ErrorIcon,
  RadioButtonUnchecked as PendingIcon,
} from '@mui/icons-material';
import CommandFieldsPanel from '../components/commands/CommandFieldsPanel';
import ExecutionOutput from '../components/commands/ExecutionOutput';
import { useElectronApi } from '../hooks/commands/useElectronApi';

function formatFlowResult(result) {
  return result.success
    ? 'Flow completed successfully!'
    : result.error || 'Flow failed';
}

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
  const {
    apiError,
    setApiError,
    clearApiError,
    getApi,
    handleApiError,
    callApi,
  } = useElectronApi();
  const showApiError = apiError && apiError !== result?.error;

  useEffect(() => {
    let isMounted = true;

    const loadFlow = async () => {
      setFlow(null);
      const flows = await callApi((api) => api.getFlows(), 'Failed to load flows');
      if (!isMounted || !flows) return;

      const nextFlow = flows.find((fl) => fl.id === flowId);
      if (!nextFlow) {
        setApiError(`Flow "${flowId}" was not found.`);
        return;
      }

      const defaults = {};
      nextFlow.params?.forEach((param) => {
        if (param.default !== undefined) defaults[param.name] = param.default;
      });

      clearApiError();
      setFlow(nextFlow);
      setParams(defaults);
      setStepStatuses(nextFlow.steps.map(() => 'pending'));
    };

    loadFlow();

    return () => {
      isMounted = false;
    };
  }, [flowId, callApi, clearApiError, setApiError]);

  useEffect(() => {
    const api = getApi('Electron API is unavailable. Flow output cannot be received.');
    if (!api) return undefined;

    try {
      const unsubs = [
        api.onFlowStepStart((data) => {
          setCurrentStep(data.index);
          setStepStatuses((prev) => {
            const next = [...prev];
            next[data.index] = 'running';
            return next;
          });
          setLogs((prev) => [...prev, { type: 'step-header', text: `\n━━━ Step ${data.index + 1}/${data.total}: ${data.name} ━━━\n` }]);
        }),
        api.onFlowOutput((data) => {
          setLogs((prev) => [...prev, data]);
        }),
        api.onFlowStepComplete((data) => {
          setStepStatuses((prev) => {
            const next = [...prev];
            next[data.index] = data.success ? 'done' : 'failed';
            return next;
          });
        }),
        api.onFlowComplete((data) => {
          setRunning(false);
          setCurrentStep(-1);
          setResult(data);
        }),
      ];

      return () => unsubs.forEach((fn) => fn?.());
    } catch (error) {
      handleApiError(error, 'Failed to subscribe to flow output');
      return undefined;
    }
  }, [getApi, handleApiError]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleParamChange = (name, value) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleBrowse = async (field, browseType) => {
    const fallback = `Failed to select ${field.label || field.name}`;
    const path = await callApi((api) => {
      if (browseType === 'folder') return api.selectFolder();
      if (browseType === 'save-file') return api.selectSaveFile(field.filters);
      return api.selectFile(field.filters);
    }, fallback);

    if (path) {
      handleParamChange(field.name, path);
    }
  };

  const handleRun = async () => {
    const api = getApi();
    if (!api) return;

    clearApiError();
    setLogs([]);
    setResult(null);
    setStepStatuses(flow.steps.map(() => 'pending'));
    setCurrentStep(-1);
    setRunning(true);

    try {
      const response = await api.runFlow(flowId, params);
      if (!response?.started) {
        throw new Error(response?.error || 'Flow did not start');
      }
    } catch (error) {
      const message = handleApiError(error, 'Failed to start flow');
      setRunning(false);
      setCurrentStep(-1);
      setResult({ success: false, error: message });
    }
  };

  const handleStop = async () => {
    await callApi((api) => api.stopFlow(), 'Failed to stop flow');
  };

  const handleClear = () => {
    setLogs([]);
    setResult(null);
    setStepStatuses(flow?.steps.map(() => 'pending') || []);
    setCurrentStep(-1);
    clearApiError();
  };

  const canRun = () => {
    if (!flow) return false;
    for (const param of flow.params || []) {
      if (param.required && !params[param.name]) return false;
    }
    return true;
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
        {apiError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {apiError}
          </Alert>
        )}
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

      {showApiError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {apiError}
        </Alert>
      )}

      {/* Params */}
      {flow.params?.length > 0 && (
        <CommandFieldsPanel
          title="Parameters"
          fields={flow.params}
          values={params}
          onChange={handleParamChange}
          onBrowse={handleBrowse}
        />
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

      <ExecutionOutput
        result={result}
        logs={logs}
        logsEndRef={logsEndRef}
        formatResult={formatFlowResult}
      />
    </Box>
  );
}

export default FlowPage;
