import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildCliArgs, resolveFlowOptions } from './cliArgs.js';
import { killProcessTree } from './processTree.js';

const IDLE_STATE = Object.freeze({ kind: null, id: null });
const DEFAULT_REPLAY_LIMIT = 5000;

export class JobAlreadyRunningError extends Error {
  constructor({ kind, id }) {
    super(`A job is already running (${kind} "${id}"). Stop it first.`);
    this.name = 'JobAlreadyRunningError';
  }
}

export function createJobRunner({
  spawnProcess = spawn,
  nodePath = process.execPath,
  cliPath,
  cwd,
  removeDirectory = (dir) => fs.rmSync(dir, { recursive: true, force: true }),
  killProcess = killProcessTree,
  replayLimit = DEFAULT_REPLAY_LIMIT,
}) {
  const listeners = new Set();
  let activeJob = null;

  function startCommand(commandId, options) {
    beginJob('command', commandId);
    runCliStep(commandId, options, 'command-output').then((result) => {
      record('command-complete', result);
      finishJob();
    });
  }

  function startFlow(flow, params) {
    beginJob('flow', flow.id);
    runFlowSteps(flow.steps, params)
      .catch(error => ({ success: false, error: error.message }))
      .then((result) => {
        record('flow-complete', result);
        finishJob();
      });
  }

  function stop() {
    if (!activeJob) return false;

    activeJob.isAborted = true;
    if (activeJob.child) killProcess(activeJob.child);
    return true;
  }

  function snapshot() {
    if (!activeJob) return { state: { ...IDLE_STATE }, events: [] };
    return { state: jobState(activeJob), events: [...activeJob.events] };
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function beginJob(kind, id) {
    if (activeJob) throw new JobAlreadyRunningError(activeJob);

    activeJob = { kind, id, events: [], child: null, isAborted: false };
    notify('job-state', jobState(activeJob));
  }

  function finishJob() {
    activeJob = null;
    notify('job-state', { ...IDLE_STATE });
  }

  async function runFlowSteps(steps, params) {
    for (let index = 0; index < steps.length; index++) {
      if (activeJob.isAborted) return stoppedByUser(index);

      const step = steps[index];
      record('flow-step-start', { index, name: step.name, total: steps.length });

      if (step.type === 'clean-dirs') {
        cleanDirectories(step.dirs);
        record('flow-step-complete', { index, name: step.name, success: true, code: 0 });
        continue;
      }

      const options = resolveFlowOptions(step.options || {}, params);
      const result = await runCliStep(step.command, options, 'flow-output');
      record('flow-step-complete', { index, name: step.name, ...result });

      if (activeJob.isAborted) return stoppedByUser(index);
      if (!result.success) {
        return { success: false, stoppedAt: index, error: `Step "${step.name}" failed with code ${result.code}` };
      }
    }

    return { success: true };
  }

  function cleanDirectories(dirs) {
    for (const dir of dirs) {
      const fullPath = path.resolve(cwd, dir);
      record('flow-output', { type: 'stdout', text: `Removing ${fullPath} ...\n` });
      try {
        removeDirectory(fullPath);
        record('flow-output', { type: 'stdout', text: '  Done.\n' });
      } catch (error) {
        record('flow-output', { type: 'stderr', text: `  Warning: ${error.message}\n` });
      }
    }
  }

  function runCliStep(commandId, options, outputEventName) {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawnProcess(nodePath, buildCliArgs({ cliPath, commandId, options }), {
          cwd,
          env: { ...process.env, FORCE_COLOR: '1' },
          windowsHide: true,
        });
      } catch (error) {
        resolve({ code: -1, success: false, error: error.message });
        return;
      }
      activeJob.child = child;
      let isSettled = false;

      const settle = (result) => {
        if (isSettled) return;
        isSettled = true;
        activeJob.child = null;
        resolve(result);
      };

      child.stdout.on('data', data => record(outputEventName, { type: 'stdout', text: data.toString() }));
      child.stderr.on('data', data => record(outputEventName, { type: 'stderr', text: data.toString() }));
      child.on('close', code => settle({ code, success: code === 0 }));
      child.on('error', error => settle({ code: -1, success: false, error: error.message }));
    });
  }

  function record(name, data) {
    if (!activeJob) return;
    activeJob.events.push({ name, data });
    if (activeJob.events.length > replayLimit) activeJob.events.shift();
    notify(name, data);
  }

  function notify(name, data) {
    for (const listener of listeners) listener(name, data);
  }

  return { startCommand, startFlow, stop, snapshot, subscribe };
}

function jobState({ kind, id }) {
  return { kind, id };
}

function stoppedByUser(index) {
  return { success: false, stoppedAt: index, error: 'Flow stopped by user' };
}
