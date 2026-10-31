import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from './client.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function createHarness(response = jsonResponse(200, {})) {
  const calls = [];
  const subscriptions = [];
  const api = createApiClient({
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, ...init });
      return typeof response === 'function' ? response(url) : response;
    },
    events: {
      subscribe: (name, callback) => {
        subscriptions.push({ name, callback });
        return () => {};
      },
    },
  });
  return { api, calls, subscriptions };
}

test('runCommand posts commandId and options as JSON', async () => {
  const { api, calls } = createHarness(jsonResponse(202, { started: true }));

  const result = await api.runCommand('top', { count: 3 });

  assert.deepEqual(result, { started: true });
  assert.equal(calls[0].url, '/api/jobs/command');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].body), { commandId: 'top', options: { count: 3 } });
});

test('runCommand resolves the body of a 409', async () => {
  const { api } = createHarness(jsonResponse(409, { started: false, error: 'A job is already running' }));
  assert.deepEqual(await api.runCommand('top', {}), { started: false, error: 'A job is already running' });
});

test('runFlow posts flowId and params', async () => {
  const { api, calls } = createHarness(jsonResponse(202, { started: true }));

  await api.runFlow('full', { archive: 'a.zip' });

  assert.equal(calls[0].url, '/api/jobs/flow');
  assert.deepEqual(JSON.parse(calls[0].body), { flowId: 'full', params: { archive: 'a.zip' } });
});

test('stopCommand and stopFlow return whether something was stopped', async () => {
  const { api, calls } = createHarness(jsonResponse(200, { stopped: true }));

  assert.equal(await api.stopCommand(), true);
  assert.equal(await api.stopFlow(), true);
  assert.deepEqual(calls.map(call => [call.method, call.url]), [['POST', '/api/jobs/stop'], ['POST', '/api/jobs/stop']]);
});

test('getConfig throws the server error message', async () => {
  const { api } = createHarness(jsonResponse(500, { error: 'boom' }));
  await assert.rejects(api.getConfig(), /boom/);
});

test('requests without an error body report the status', async () => {
  const { api } = createHarness({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
  await assert.rejects(api.getCommands(), /Request failed \(502\)/);
});

test('saveConfig reports failures as a result instead of throwing', async () => {
  const { api } = createHarness(jsonResponse(400, { error: 'config must be an object' }));
  assert.deepEqual(await api.saveConfig([]), { success: false, error: 'config must be an object' });
});

test('saveConfig sends a PUT', async () => {
  const { api, calls } = createHarness(jsonResponse(200, { success: true }));

  assert.deepEqual(await api.saveConfig({ a: 1 }), { success: true });
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].url, '/api/config');
});

test('readFile encodes the path query and returns text', async () => {
  const { api, calls } = createHarness(jsonResponse(200, 'file body'));

  assert.equal(await api.readFile('C:\\a b\\#1.json'), 'file body');
  assert.equal(calls[0].url, '/api/files/text?path=C%3A%5Ca%20b%5C%231.json');
});

test('listDirectory omits the path query when no path is given', async () => {
  const { api, calls } = createHarness(jsonResponse(200, { entries: [] }));

  await api.listDirectory('');
  await api.listDirectory('/tmp');

  assert.deepEqual(calls.map(call => call.url), ['/api/fs/list', '/api/fs/list?path=%2Ftmp']);
});

test('getMediaDuration returns the duration number', async () => {
  const { api } = createHarness(jsonResponse(200, { duration: 12.5 }));
  assert.equal(await api.getMediaDuration('/a.mp4'), 12.5);
});

test('music endpoints use the documented routes', async () => {
  const { api, calls } = createHarness(jsonResponse(200, []));

  await api.scanClips('/clips');
  await api.describeAudioFiles(['/a.mp3']);
  await api.saveMusicTimeline('/out/t.json', { version: 1 });
  await api.loadMusicTimeline('/out/t.json');

  assert.deepEqual(calls.map(call => [call.method || 'GET', call.url]), [
    ['GET', '/api/music/clips?folder=%2Fclips'],
    ['POST', '/api/music/audio-files'],
    ['PUT', '/api/music/timeline'],
    ['GET', '/api/music/timeline?path=%2Fout%2Ft.json'],
  ]);
  assert.deepEqual(JSON.parse(calls[2].body), { outputPath: '/out/t.json', data: { version: 1 } });
});

test('event helpers subscribe to the matching server events', () => {
  const { api, subscriptions } = createHarness();
  const callback = () => {};

  api.onCommandOutput(callback);
  api.onCommandComplete(callback);
  api.onFlowStepStart(callback);
  api.onFlowOutput(callback);
  api.onFlowStepComplete(callback);
  api.onFlowComplete(callback);
  api.onJobState(callback);

  assert.deepEqual(subscriptions.map(subscription => subscription.name), [
    'command-output',
    'command-complete',
    'flow-step-start',
    'flow-output',
    'flow-step-complete',
    'flow-complete',
    'job-state',
  ]);
  assert.ok(subscriptions.every(subscription => subscription.callback === callback));
});

test('a 401 notifies session-expired listeners and still rejects', async () => {
  const { api } = createHarness(jsonResponse(401, { error: 'Not signed in.' }));
  let notified = 0;
  api.onSessionExpired(() => { notified += 1; });

  await assert.rejects(api.getCommands(), /Not signed in/);
  assert.equal(notified, 1);
});

test('a 401 on a job start also notifies session-expired listeners', async () => {
  const { api } = createHarness(jsonResponse(401, { error: 'Not signed in.' }));
  let notified = 0;
  api.onSessionExpired(() => { notified += 1; });

  await api.runCommand('top', {});
  assert.equal(notified, 1);
});
