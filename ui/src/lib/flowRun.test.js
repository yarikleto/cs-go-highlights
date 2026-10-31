import test from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_FLOW_RUN, flowRunReducer } from './flowRun.js';

function reduce(actions, state = IDLE_FLOW_RUN) {
  return actions.reduce(flowRunReducer, state);
}

const replayedEvents = [
  { type: 'job-state', data: { kind: 'flow', id: 'full' } },
  { type: 'flow-step-start', data: { index: 0, name: 'Clean', total: 2 } },
  { type: 'flow-output', data: { type: 'stdout', text: 'Removing…' } },
  { type: 'flow-step-complete', data: { index: 0, name: 'Clean', success: true, code: 0 } },
  { type: 'flow-step-start', data: { index: 1, name: 'Analyze', total: 2 } },
];

test('job-state for a flow marks that flow as running', () => {
  const state = reduce([{ type: 'job-state', data: { kind: 'flow', id: 'full' } }]);
  assert.equal(state.flowId, 'full');
  assert.equal(state.isRunning, true);
});

test('replayed events rebuild step statuses, current step and logs', () => {
  const state = reduce(replayedEvents);

  assert.deepEqual(state.stepStatuses, ['done', 'running']);
  assert.equal(state.currentStep, 1);
  assert.deepEqual(state.logs.map(log => log.type), ['step-header', 'stdout', 'step-header']);
  assert.match(state.logs[2].text, /Step 2\/2: Analyze/);
});

test('a second job-state for the same running flow replaces logs instead of duplicating them', () => {
  const state = reduce([...replayedEvents, ...replayedEvents]);
  assert.equal(state.logs.length, 3);
});

test('flow-complete stores the result and stops running', () => {
  const result = { success: false, stoppedAt: 1, error: 'Flow stopped by user' };
  const state = reduce([...replayedEvents, { type: 'flow-complete', data: result }]);

  assert.equal(state.isRunning, false);
  assert.equal(state.currentStep, -1);
  assert.deepEqual(state.result, result);
  assert.equal(state.flowId, 'full');
});

test('job-state idle stops a run whose completion was missed', () => {
  const state = reduce([...replayedEvents, { type: 'job-state', data: { kind: null, id: null } }]);
  assert.equal(state.isRunning, false);
});

test('job-state for a command leaves the flow run alone', () => {
  const before = reduce(replayedEvents);
  assert.equal(flowRunReducer(before, { type: 'job-state', data: { kind: 'command', id: 'top' } }), before);
});

test('start-requested resets the run for the new flow', () => {
  const state = reduce([...replayedEvents, { type: 'flow-complete', data: { success: true } }, { type: 'start-requested', data: { flowId: 'other' } }]);
  assert.deepEqual(state, { ...IDLE_FLOW_RUN, flowId: 'other', isRunning: true });
});

test('start-failed stops running with the error as the result', () => {
  const state = reduce([{ type: 'start-requested', data: { flowId: 'full' } }, { type: 'start-failed', data: { error: 'busy' } }]);
  assert.equal(state.isRunning, false);
  assert.deepEqual(state.result, { success: false, error: 'busy' });
});

test('cleared returns to idle', () => {
  assert.deepEqual(reduce([...replayedEvents, { type: 'cleared' }]), IDLE_FLOW_RUN);
});
