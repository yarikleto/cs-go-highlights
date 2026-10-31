import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { createJobRunner, JobAlreadyRunningError } from './jobRunner.js';

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.pid = 4242;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
  }
}

function createHarness(overrides = {}) {
  const spawned = [];
  const killed = [];
  const removed = [];
  const events = [];
  const runner = createJobRunner({
    spawnProcess: (command, args, options) => {
      const child = new FakeChild();
      spawned.push({ command, args, options, child });
      return child;
    },
    nodePath: '/usr/bin/node',
    cliPath: '/repo/src/cli/index.js',
    cwd: '/repo',
    removeDirectory: (dir) => removed.push(dir),
    killProcess: (child) => killed.push(child),
    ...overrides,
  });
  runner.subscribe((name, data) => events.push({ name, data }));
  return { runner, spawned, killed, removed, events };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

function eventsNamed(events, name) {
  return events.filter(event => event.name === name).map(event => event.data);
}

test('startCommand spawns node with the CLI args', () => {
  const { runner, spawned } = createHarness();

  runner.startCommand('top', { count: 3 });

  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].command, '/usr/bin/node');
  assert.deepEqual(spawned[0].args, ['/repo/src/cli/index.js', 'top', '--count', '3']);
  assert.equal(spawned[0].options.cwd, '/repo');
  assert.equal(spawned[0].options.windowsHide, true);
  assert.equal(spawned[0].options.shell, undefined);
});

test('startCommand streams output and completes with the exit code', async () => {
  const { runner, spawned, events } = createHarness();

  runner.startCommand('top', {});
  spawned[0].child.stdout.emit('data', Buffer.from('hi'));
  spawned[0].child.stderr.emit('data', Buffer.from('oops'));
  spawned[0].child.emit('close', 0);
  await flush();

  assert.deepEqual(eventsNamed(events, 'command-output'), [
    { type: 'stdout', text: 'hi' },
    { type: 'stderr', text: 'oops' },
  ]);
  assert.deepEqual(eventsNamed(events, 'command-complete'), [{ code: 0, success: true }]);
  assert.deepEqual(eventsNamed(events, 'job-state'), [
    { kind: 'command', id: 'top' },
    { kind: null, id: null },
  ]);
  assert.deepEqual(runner.snapshot().state, { kind: null, id: null });
});

test('startCommand throws JobAlreadyRunningError while a job runs', async () => {
  const { runner, spawned, events } = createHarness();

  runner.startCommand('top', {});

  assert.throws(() => runner.startCommand('merge', {}), JobAlreadyRunningError);
  assert.throws(() => runner.startFlow({ id: 'f', steps: [] }, {}), /already running \(command "top"\)/);
  assert.equal(spawned.length, 1);

  spawned[0].child.emit('close', 0);
  await flush();
  assert.deepEqual(eventsNamed(events, 'command-complete'), [{ code: 0, success: true }]);
});

test('stop returns false when idle', () => {
  const { runner } = createHarness();
  assert.equal(runner.stop(), false);
});

test('stop kills the running child', () => {
  const { runner, spawned, killed } = createHarness();

  runner.startCommand('top', {});

  assert.equal(runner.stop(), true);
  assert.deepEqual(killed, [spawned[0].child]);
});

test('a child emitting error then close completes once', async () => {
  const { runner, spawned, events } = createHarness();

  runner.startCommand('top', {});
  spawned[0].child.emit('error', new Error('spawn ENOENT'));
  spawned[0].child.emit('close', -2);
  await flush();

  assert.deepEqual(eventsNamed(events, 'command-complete'), [
    { code: -1, success: false, error: 'spawn ENOENT' },
  ]);
});

test('startFlow runs steps in order and stops at the first failure', async () => {
  const { runner, spawned, events } = createHarness();
  const flow = {
    id: 'pipeline',
    steps: [
      { name: 'Analyze', command: 'analyze', options: { demos: '$demos' } },
      { name: 'Record', command: 'record', options: {} },
      { name: 'Merge', command: 'merge', options: {} },
    ],
  };

  runner.startFlow(flow, { demos: './d' });
  assert.deepEqual(spawned[0].args, ['/repo/src/cli/index.js', 'analyze', '--demos', './d']);
  spawned[0].child.stdout.emit('data', Buffer.from('analyzing'));
  spawned[0].child.emit('close', 0);
  await flush();
  spawned[1].child.emit('close', 1);
  await flush();

  assert.equal(spawned.length, 2);
  assert.deepEqual(eventsNamed(events, 'flow-step-start'), [
    { index: 0, name: 'Analyze', total: 3 },
    { index: 1, name: 'Record', total: 3 },
  ]);
  assert.deepEqual(eventsNamed(events, 'flow-output'), [{ type: 'stdout', text: 'analyzing' }]);
  assert.deepEqual(eventsNamed(events, 'flow-step-complete'), [
    { index: 0, name: 'Analyze', code: 0, success: true },
    { index: 1, name: 'Record', code: 1, success: false },
  ]);
  assert.deepEqual(eventsNamed(events, 'flow-complete'), [
    { success: false, stoppedAt: 1, error: 'Step "Record" failed with code 1' },
  ]);
  assert.deepEqual(eventsNamed(events, 'command-output'), []);
});

test('stopping a flow mid-step ends it as stopped by user', async () => {
  const { runner, spawned, events } = createHarness();
  const flow = { id: 'f', steps: [{ name: 'A', command: 'a' }, { name: 'B', command: 'b' }] };

  runner.startFlow(flow, {});
  runner.stop();
  spawned[0].child.emit('close', null);
  await flush();

  assert.equal(spawned.length, 1);
  assert.deepEqual(eventsNamed(events, 'flow-complete'), [
    { success: false, stoppedAt: 0, error: 'Flow stopped by user' },
  ]);
  assert.deepEqual(runner.snapshot().state, { kind: null, id: null });
});

test('a successful flow completes with success', async () => {
  const { runner, spawned, events } = createHarness();

  runner.startFlow({ id: 'f', steps: [{ name: 'A', command: 'a' }] }, {});
  spawned[0].child.emit('close', 0);
  await flush();

  assert.deepEqual(eventsNamed(events, 'flow-complete'), [{ success: true }]);
});

test('clean-dirs steps call removeDirectory with project-resolved paths', async () => {
  const { runner, removed, events } = createHarness();

  runner.startFlow({ id: 'f', steps: [{ name: 'Clean', type: 'clean-dirs', dirs: ['./temp/demos'] }] }, {});
  await flush();

  assert.deepEqual(removed, [path.resolve('/repo', './temp/demos')]);
  assert.deepEqual(eventsNamed(events, 'flow-step-complete'), [{ index: 0, name: 'Clean', success: true, code: 0 }]);
  assert.deepEqual(eventsNamed(events, 'flow-complete'), [{ success: true }]);
});

test('clean-dirs reports removal failures as warnings', async () => {
  const { runner, events } = createHarness({
    removeDirectory: () => { throw new Error('EBUSY'); },
  });

  runner.startFlow({ id: 'f', steps: [{ name: 'Clean', type: 'clean-dirs', dirs: ['./x'] }] }, {});
  await flush();

  assert.ok(eventsNamed(events, 'flow-output').some(output => output.type === 'stderr' && output.text.includes('EBUSY')));
});

test('snapshot replays the active job events and is empty after it finishes', async () => {
  const { runner, spawned } = createHarness();

  runner.startCommand('top', {});
  spawned[0].child.stdout.emit('data', Buffer.from('one'));

  assert.deepEqual(runner.snapshot(), {
    state: { kind: 'command', id: 'top' },
    events: [{ name: 'command-output', data: { type: 'stdout', text: 'one' } }],
  });

  spawned[0].child.emit('close', 0);
  await flush();
  assert.deepEqual(runner.snapshot(), { state: { kind: null, id: null }, events: [] });
});

test('snapshot keeps only the newest events up to replayLimit', () => {
  const { runner, spawned } = createHarness({ replayLimit: 2 });

  runner.startCommand('top', {});
  for (const text of ['a', 'b', 'c']) spawned[0].child.stdout.emit('data', Buffer.from(text));

  assert.deepEqual(runner.snapshot().events.map(event => event.data.text), ['b', 'c']);
});

test('unsubscribe stops delivering events', () => {
  const { runner } = createHarness();
  const received = [];
  const unsubscribe = runner.subscribe((name) => received.push(name));

  unsubscribe();
  runner.startCommand('top', {});

  assert.deepEqual(received, []);
});

test('output arriving after an error completion does not throw', async () => {
  const { runner, spawned, events } = createHarness();

  runner.startCommand('top', {});
  spawned[0].child.emit('error', new Error('boom'));
  await flush();

  assert.doesNotThrow(() => spawned[0].child.stdout.emit('data', Buffer.from('late')));
  assert.deepEqual(eventsNamed(events, 'command-output'), []);
});

test('a spawn that throws completes the command as failed and frees the runner', async () => {
  const { runner, events } = createHarness({
    spawnProcess: () => { throw new TypeError('The argument contains null bytes'); },
  });

  runner.startCommand('top', {});
  await flush();

  assert.deepEqual(eventsNamed(events, 'command-complete'), [
    { code: -1, success: false, error: 'The argument contains null bytes' },
  ]);
  assert.deepEqual(runner.snapshot().state, { kind: null, id: null });
  assert.doesNotThrow(() => runner.startCommand('top', {}));
});

test('a spawn that throws inside a flow fails that step', async () => {
  const { runner, events } = createHarness({
    spawnProcess: () => { throw new TypeError('bad arg'); },
  });

  runner.startFlow({ id: 'f', steps: [{ name: 'A', command: 'a' }] }, {});
  await flush();

  assert.deepEqual(eventsNamed(events, 'flow-complete'), [
    { success: false, stoppedAt: 0, error: 'Step "A" failed with code -1' },
  ]);
  assert.deepEqual(runner.snapshot().state, { kind: null, id: null });
});
