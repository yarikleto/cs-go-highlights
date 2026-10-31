export const IDLE_FLOW_RUN = Object.freeze({
  flowId: null,
  isRunning: false,
  currentStep: -1,
  stepStatuses: [],
  logs: [],
  result: null,
});

const HANDLERS = {
  'job-state': applyJobState,
  'flow-step-start': (state, { index, name, total }) => ({
    ...state,
    currentStep: index,
    stepStatuses: withStatus(state.stepStatuses, index, 'running'),
    logs: [...state.logs, { type: 'step-header', text: `\n━━━ Step ${index + 1}/${total}: ${name} ━━━\n` }],
  }),
  'flow-output': (state, output) => ({ ...state, logs: [...state.logs, output] }),
  'flow-step-complete': (state, { index, success }) => ({
    ...state,
    stepStatuses: withStatus(state.stepStatuses, index, success ? 'done' : 'failed'),
  }),
  'flow-complete': (state, result) => ({ ...state, isRunning: false, currentStep: -1, result }),
  'start-requested': (state, { flowId }) => ({ ...IDLE_FLOW_RUN, flowId, isRunning: true }),
  'start-failed': (state, { error }) => ({ ...state, isRunning: false, currentStep: -1, result: { success: false, error } }),
  cleared: () => IDLE_FLOW_RUN,
};

/** Flow run state rebuilt from server events, so it survives page navigation and replays after a reload. */
export function flowRunReducer(state, { type, data }) {
  const handler = HANDLERS[type];
  return handler ? handler(state, data) : state;
}

/** The server replays the active job's events right after job-state, so a fresh start avoids duplicated logs. */
function applyJobState(state, { kind, id }) {
  if (kind === 'flow') return { ...IDLE_FLOW_RUN, flowId: id, isRunning: true };
  if (kind === null && state.isRunning) return { ...state, isRunning: false, currentStep: -1 };
  return state;
}

function withStatus(statuses, index, status) {
  const next = [...statuses];
  next[index] = status;
  return next;
}
