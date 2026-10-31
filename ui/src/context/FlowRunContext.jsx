import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { api } from '../lib/api/client';
import { IDLE_FLOW_RUN, flowRunReducer } from '../lib/flowRun';

const FlowRunContext = createContext(null);

const SERVER_EVENTS = Object.freeze([
  ['job-state', 'onJobState'],
  ['flow-step-start', 'onFlowStepStart'],
  ['flow-output', 'onFlowOutput'],
  ['flow-step-complete', 'onFlowStepComplete'],
  ['flow-complete', 'onFlowComplete'],
]);

export function FlowRunProvider({ children }) {
  const [flowRun, dispatch] = useReducer(flowRunReducer, IDLE_FLOW_RUN);

  useEffect(() => {
    const unsubscribes = SERVER_EVENTS.map(([type, subscribe]) => api[subscribe](data => dispatch({ type, data })));
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, []);

  const markStartRequested = useCallback(flowId => dispatch({ type: 'start-requested', data: { flowId } }), []);
  const markStartFailed = useCallback(error => dispatch({ type: 'start-failed', data: { error } }), []);
  const clearFlowRun = useCallback(() => dispatch({ type: 'cleared' }), []);

  const value = useMemo(
    () => ({ flowRun, markStartRequested, markStartFailed, clearFlowRun }),
    [flowRun, markStartRequested, markStartFailed, clearFlowRun],
  );

  return <FlowRunContext.Provider value={value}>{children}</FlowRunContext.Provider>;
}

export function useFlowRun() {
  const context = useContext(FlowRunContext);
  if (!context) {
    throw new Error('useFlowRun must be used within a FlowRunProvider');
  }
  return context;
}
