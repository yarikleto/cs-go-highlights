import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createUiServer } from './createUiServer.js';
import { CONTENT_SECURITY_POLICY } from './constants.js';
import { JobAlreadyRunningError } from './jobRunner.js';

const TOKEN = 'a'.repeat(64);
const SESSION = `csgo_highlights_session=${TOKEN}`;

function createFakeJobRunner(overrides = {}) {
  const calls = [];
  return {
    calls,
    startCommand: (...args) => calls.push(['startCommand', ...args]),
    startFlow: (...args) => calls.push(['startFlow', ...args]),
    stop: () => false,
    snapshot: () => ({ state: { kind: null, id: null }, events: [] }),
    subscribe: () => () => {},
    ...overrides,
  };
}

async function startServer(t, { jobRunner = createFakeJobRunner() } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ui-server-')));
  const distDir = path.join(root, 'dist');
  fs.mkdirSync(distDir);
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>UI</title>');
  fs.writeFileSync(path.join(root, 'package.json'), '{"secret":true}');

  const server = createUiServer({
    token: TOKEN,
    distDir,
    jobRunner,
    commands: [{ id: 'top', name: 'Top' }],
    flows: [{ id: 'full', steps: [] }],
    projectRoot: root,
    probeDuration: async () => 7,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  t.after(() => {
    server.closeAllConnections();
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  return { root, distDir, port: server.address().port };
}

function request(port, { method = 'GET', path: requestPath, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: requestPath, headers }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

function json(response) {
  return JSON.parse(response.body.toString('utf8'));
}

test('rejects an unexpected Host header', async (t) => {
  const { port } = await startServer(t);
  const response = await request(port, { path: '/', headers: { Host: `evil.test:${port}` } });
  assert.equal(response.status, 403);
});

test('serves index.html without a session and sends the CSP header', async (t) => {
  const { port } = await startServer(t);
  const response = await request(port, { path: '/' });

  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /text\/html/);
  assert.equal(response.headers['content-security-policy'], CONTENT_SECURITY_POLICY);
  assert.match(response.body.toString(), /<title>UI<\/title>/);
});

test('session route sets the cookie for a valid token', async (t) => {
  const { port } = await startServer(t);
  const response = await request(port, { path: `/session?token=${TOKEN}` });

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/');
  assert.equal(response.headers['set-cookie'][0], `${SESSION}; HttpOnly; SameSite=Strict; Path=/`);
});

test('session route rejects a wrong token', async (t) => {
  const { port } = await startServer(t);
  const response = await request(port, { path: '/session?token=nope' });
  assert.equal(response.status, 403);
  assert.equal(response.headers['set-cookie'], undefined);
});

test('api requires the session cookie', async (t) => {
  const { port } = await startServer(t);
  const response = await request(port, { path: '/api/commands' });
  assert.equal(response.status, 401);
  assert.match(json(response).error, /csgo-highlights ui/);
});

test('api serves commands with a session', async (t) => {
  const { port } = await startServer(t);
  const response = await request(port, { path: '/api/commands', headers: { Cookie: SESSION } });
  assert.equal(response.status, 200);
  assert.deepEqual(json(response), [{ id: 'top', name: 'Top' }]);
});

test('rejects cross-origin POSTs', async (t) => {
  const { port } = await startServer(t);
  const response = await request(port, {
    method: 'POST',
    path: '/api/jobs/stop',
    headers: { Cookie: SESSION, Origin: 'http://evil.test' },
  });
  assert.equal(response.status, 403);
});

test('accepts same-origin and origin-less POSTs', async (t) => {
  const { port } = await startServer(t);

  for (const headers of [{ Cookie: SESSION }, { Cookie: SESSION, Origin: `http://127.0.0.1:${port}` }]) {
    const response = await request(port, { method: 'POST', path: '/api/jobs/stop', headers });
    assert.equal(response.status, 200);
    assert.deepEqual(json(response), { stopped: false });
  }
});

test('job route starts a known command', async (t) => {
  const jobRunner = createFakeJobRunner();
  const { port } = await startServer(t, { jobRunner });

  const response = await request(port, {
    method: 'POST',
    path: '/api/jobs/command',
    headers: { Cookie: SESSION },
    body: { commandId: 'top', options: { count: 3 } },
  });

  assert.equal(response.status, 202);
  assert.deepEqual(json(response), { started: true });
  assert.deepEqual(jobRunner.calls, [['startCommand', 'top', { count: 3 }]]);
});

test('job route returns 404 for an unknown command', async (t) => {
  const { port } = await startServer(t);
  const response = await request(port, {
    method: 'POST',
    path: '/api/jobs/command',
    headers: { Cookie: SESSION },
    body: { commandId: 'nope', options: {} },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(json(response), { started: false, error: 'Command "nope" not found' });
});

test('job route returns 409 while busy', async (t) => {
  const jobRunner = createFakeJobRunner({
    startFlow: () => { throw new JobAlreadyRunningError({ kind: 'command', id: 'top' }); },
  });
  const { port } = await startServer(t, { jobRunner });

  const response = await request(port, {
    method: 'POST',
    path: '/api/jobs/flow',
    headers: { Cookie: SESSION },
    body: { flowId: 'full', params: {} },
  });

  assert.equal(response.status, 409);
  assert.equal(json(response).started, false);
  assert.match(json(response).error, /already running/);
});

test('job route rejects invalid JSON', async (t) => {
  const { port } = await startServer(t);
  const response = await new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, method: 'POST', path: '/api/jobs/command', headers: { Cookie: SESSION },
    }, res => { res.resume(); resolve(res); });
    req.on('error', reject);
    req.end('{ nope');
  });
  assert.equal(response.statusCode, 400);
});

test('events stream starts with job-state then replays the snapshot', async (t) => {
  const jobRunner = createFakeJobRunner({
    snapshot: () => ({
      state: { kind: 'command', id: 'top' },
      events: [{ name: 'command-output', data: { type: 'stdout', text: 'hi' } }],
    }),
  });
  const { port } = await startServer(t, { jobRunner });

  const text = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/events', headers: { Cookie: SESSION } }, (res) => {
      assert.equal(res.headers['content-type'], 'text/event-stream');
      let received = '';
      res.on('data', (chunk) => {
        received += chunk;
        if (received.split('\n\n').length > 2) {
          req.destroy();
          resolve(received);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });

  assert.equal(
    text,
    'event: job-state\ndata: {"kind":"command","id":"top"}\n\n'
      + 'event: command-output\ndata: {"type":"stdout","text":"hi"}\n\n',
  );
});

test('text file route returns 404 for a missing file', async (t) => {
  const { root, port } = await startServer(t);
  const missing = encodeURIComponent(path.join(root, 'missing.json'));
  const response = await request(port, { path: `/api/files/text?path=${missing}`, headers: { Cookie: SESSION } });
  assert.equal(response.status, 404);
});

test('text file route requires the path query', async (t) => {
  const { port } = await startServer(t);
  const response = await request(port, { path: '/api/files/text', headers: { Cookie: SESSION } });
  assert.equal(response.status, 400);
  assert.match(json(response).error, /path/);
});

test('fs list route lists the project root by default', async (t) => {
  const { root, port } = await startServer(t);
  const response = await request(port, { path: '/api/fs/list', headers: { Cookie: SESSION } });

  assert.equal(response.status, 200);
  assert.equal(json(response).path, root);
  assert.deepEqual(json(response).entries.map(entry => entry.name), ['dist', 'package.json']);
});

test('music audio-files route describes each path', async (t) => {
  const { port } = await startServer(t);
  const response = await request(port, {
    method: 'POST',
    path: '/api/music/audio-files',
    headers: { Cookie: SESSION },
    body: { paths: ['/m/a.mp3'] },
  });
  assert.deepEqual(json(response), [{ filename: 'a.mp3', path: '/m/a.mp3', duration: 7 }]);
});

test('media route serves a byte range for a path with special characters', async (t) => {
  const { root, port } = await startServer(t);
  const filePath = path.join(root, 'my clip #1 é.mp4');
  fs.writeFileSync(filePath, Buffer.from('0123456789'));

  const response = await request(port, {
    path: `/media?path=${encodeURIComponent(filePath)}`,
    headers: { Cookie: SESSION, Range: 'bytes=0-3' },
  });

  assert.equal(response.status, 206);
  assert.equal(response.headers['content-range'], 'bytes 0-3/10');
  assert.equal(response.headers['content-type'], 'video/mp4');
  assert.equal(response.body.toString(), '0123');
});

test('media route answers 416 for an unsatisfiable range', async (t) => {
  const { root, port } = await startServer(t);
  const filePath = path.join(root, 'a.mp4');
  fs.writeFileSync(filePath, Buffer.from('0123'));

  const response = await request(port, {
    path: `/media?path=${encodeURIComponent(filePath)}`,
    headers: { Cookie: SESSION, Range: 'bytes=50-' },
  });

  assert.equal(response.status, 416);
  assert.equal(response.headers['content-range'], 'bytes */4');
});

test('media route survives a client abort', async (t) => {
  const { root, port } = await startServer(t);
  const filePath = path.join(root, 'big.mp4');
  fs.writeFileSync(filePath, Buffer.alloc(8 * 1024 * 1024, 1));
  const mediaPath = `/media?path=${encodeURIComponent(filePath)}`;

  await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: mediaPath, headers: { Cookie: SESSION, Range: 'bytes=0-' } }, () => {
      req.destroy();
      resolve();
    });
    req.on('error', () => {});
    req.on('close', resolve);
    req.end();
    setTimeout(() => reject(new Error('no response')), 2000).unref();
  });

  const response = await request(port, { path: mediaPath, headers: { Cookie: SESSION, Range: 'bytes=0-1' } });
  assert.equal(response.status, 206);
});

test('static route refuses path traversal', async (t) => {
  const { port } = await startServer(t);
  const response = await request(port, { path: '/..%2fpackage.json' });
  assert.equal(response.status, 404);
  assert.doesNotMatch(response.body.toString(), /secret/);
});

test('static route survives a file that cannot be read', async (t) => {
  const { distDir, port } = await startServer(t);
  const lockedFile = path.join(distDir, 'locked.js');
  fs.writeFileSync(lockedFile, 'x');
  fs.chmodSync(lockedFile, 0o000);

  await request(port, { path: '/locked.js' }).catch(() => {});
  const response = await request(port, { path: '/' });

  assert.equal(response.status, 200);
});
