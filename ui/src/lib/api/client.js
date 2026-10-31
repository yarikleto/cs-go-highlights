import { createEventStream } from './eventStream.js';

const JSON_HEADERS = Object.freeze({ 'Content-Type': 'application/json' });
const UNAUTHORIZED = 401;

export function createApiClient({ fetchImpl = (...args) => globalThis.fetch(...args), events = createEventStream() } = {}) {
  const sessionExpiredListeners = new Set();

  async function send(url, init) {
    const response = await fetchImpl(url, init);
    if (response.status === UNAUTHORIZED) {
      for (const listener of sessionExpiredListeners) listener();
    }
    return response;
  }

  async function request(url, init) {
    const response = await send(url, init);
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return response;
  }

  function onSessionExpired(callback) {
    sessionExpiredListeners.add(callback);
    return () => sessionExpiredListeners.delete(callback);
  }

  const getJson = async (url) => (await request(url)).json();
  const sendJson = async (method, url, body) => (await request(url, jsonInit(method, body))).json();

  async function startJob(url, body) {
    const response = await send(url, jsonInit('POST', body));
    return response.json();
  }

  async function stopJob() {
    const { stopped } = await sendJson('POST', '/api/jobs/stop');
    return stopped;
  }

  async function saveConfig(config) {
    try {
      return await sendJson('PUT', '/api/config', config);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  const on = name => callback => events.subscribe(name, callback);

  return {
    getCommands: () => getJson('/api/commands'),
    getFlows: () => getJson('/api/flows'),
    runCommand: (commandId, options) => startJob('/api/jobs/command', { commandId, options }),
    runFlow: (flowId, params) => startJob('/api/jobs/flow', { flowId, params }),
    stopCommand: stopJob,
    stopFlow: stopJob,
    onCommandOutput: on('command-output'),
    onCommandComplete: on('command-complete'),
    onFlowStepStart: on('flow-step-start'),
    onFlowOutput: on('flow-output'),
    onFlowStepComplete: on('flow-step-complete'),
    onFlowComplete: on('flow-complete'),
    onJobState: on('job-state'),
    onSessionExpired,
    getConfig: () => getJson('/api/config'),
    saveConfig,
    readFile: async filePath => (await request(withQuery('/api/files/text', { path: filePath }))).text(),
    listDirectory: directoryPath => getJson(withQuery('/api/fs/list', { path: directoryPath })),
    listRoots: () => getJson('/api/fs/roots'),
    getMediaDuration: async filePath => (await getJson(withQuery('/api/media/duration', { path: filePath }))).duration,
    scanClips: folder => getJson(withQuery('/api/music/clips', { folder })),
    describeAudioFiles: paths => sendJson('POST', '/api/music/audio-files', { paths }),
    saveMusicTimeline: (outputPath, data) => sendJson('PUT', '/api/music/timeline', { outputPath, data }),
    loadMusicTimeline: filePath => getJson(withQuery('/api/music/timeline', { path: filePath })),
  };
}

export const api = typeof window === 'undefined' ? null : createApiClient();

function jsonInit(method, body) {
  return body === undefined
    ? { method, headers: JSON_HEADERS }
    : { method, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function withQuery(url, params) {
  const query = Object.entries(params)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('&');
  return query ? `${url}?${query}` : url;
}

async function readErrorMessage(response) {
  try {
    const body = await response.json();
    if (body?.error) return body.error;
  } catch {
    // Non-JSON error bodies fall through to the status message.
  }
  return `Request failed (${response.status})`;
}
