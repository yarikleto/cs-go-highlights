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
import PageHeader from '../components/shell/PageHeader';
import { useApi } from '../hooks/useApi';
import { useFlowRun } from '../context/FlowRunContext';
import { IDLE_FLOW_RUN } from '../lib/flowRun';

function formatFlowResult(result) {
  return result.success
    ? 'Flow completed successfully!'
    : result.error || 'Flow failed';
}

function FlowPage() {
  const { flowId } = useParams();
  const [flow, setFlow] = useState(null);
  const [params, setParams] = useState({});
  const logsEndRef = useRef(null);
  const {
    apiError,
    setApiError,
    clearApiError,
    getApi,
    handleApiError,
    callApi,
  } = useApi();
  const { flowRun, markStartRequested, markStartFailed, clearFlowRun } = useFlowRun();
  const { isRunning, currentStep, stepStatuses, logs, result } = flowRun.flowId === flowId ? flowRun : IDLE_FLOW_RUN;
  const isOtherFlowRunning = flowRun.isRunning && flowRun.flowId !== flowId;
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
    };

    loadFlow();

    return () => {
      isMounted = false;
    };
  }, [flowId, callApi, clearApiError, setApiError]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleParamChange = (name, value) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleBrowse = async (field, browseType) => {
    const fallback = `Failed to select ${field.label || field.name}`;
    const path = await callApi((api) => api.pickPath({
      mode: browseType,
      filters: field.filters,
      initialPath: params[field.name],
    }), fallback);

    if (path) {
      handleParamChange(field.name, path);
    }
  };

  const handleRun = async () => {
    clearApiError();
    markStartRequested(flowId);

    try {
      const response = await getApi().runFlow(flowId, params);
      if (!response?.started) {
        throw new Error(response?.error || 'Flow did not start');
      }
    } catch (error) {
      markStartFailed(handleApiError(error, 'Failed to start flow'));
    }
  };

  const handleStop = async () => {
    await callApi((api) => api.stopFlow(), 'Failed to stop flow');
  };

  const handleClear = () => {
    clearFlowRun();
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
        <Typography color="text.secondary">Loading…</Typography>
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
    <Box sx={{ p: 4, minHeight: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1200 }}>
      <PageHeader
        title={flow.name}
        subtitle={flow.description}
        chip={<Chip label="Flow" size="small" color="primary" variant="outlined" />}
      />

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
        {isRunning && (
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
                    fontSize: '0.875rem',
                    fontWeight: stepStatuses[i] === 'running' ? 600 : 450,
                    ...(stepStatuses[i] === 'running' && { color: 'primary.main' }),
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
        {!isRunning ? (
          <Button
            variant="contained"
            size="large"
            startIcon={<PlayIcon />}
            onClick={handleRun}
            disabled={!canRun() || isOtherFlowRunning}
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

        {logs.length > 0 && !isRunning && (
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
