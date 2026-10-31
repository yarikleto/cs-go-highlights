import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from '../../config.js';
import { COMMANDS, FLOWS } from '../../shared/commandsConfig.js';
import { buildSessionUrl, createSessionToken } from '../../server/auth.js';
import { DEFAULT_UI_PORT, DEV_SERVER_ORIGIN, UI_HOST } from '../../server/constants.js';
import { createJobRunner } from '../../server/jobRunner.js';
import { createUiServer } from '../../server/createUiServer.js';
import { PROJECT_ROOT, resolveProjectPath } from '../../server/paths.js';
import { probeMediaDurationSeconds } from '../utils/ffmpeg.js';

const MAX_PORT = 65535;
const UI_DIST_DIR = path.join(PROJECT_ROOT, 'ui', 'dist');
const CLI_ENTRY = path.join(PROJECT_ROOT, 'src', 'cli', 'index.js');

export async function uiCommand({ port = DEFAULT_UI_PORT, dev = false }) {
  try {
    await startUi({ port: parsePort(port), isDevMode: dev === true });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

export function parsePort(value) {
  const port = Number(value);
  if (String(value).trim() === '' || !Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`--port must be an integer between 1 and ${MAX_PORT}`);
  }
  return port;
}

export function assertUiBuilt(distDir) {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('UI build not found at ui/dist. Run "npm run build" first.');
  }
}

async function startUi({ port, isDevMode }) {
  if (!isDevMode) assertUiBuilt(UI_DIST_DIR);

  const token = createSessionToken();
  const jobRunner = createJobRunner({ cliPath: CLI_ENTRY, cwd: PROJECT_ROOT });
  const server = createUiServer({
    token,
    distDir: UI_DIST_DIR,
    extraOrigins: isDevMode ? [DEV_SERVER_ORIGIN] : [],
    jobRunner,
    commands: COMMANDS,
    flows: FLOWS,
    configPath: resolveProjectPath(PATHS.uiConfig),
    projectRoot: PROJECT_ROOT,
    probeDuration: probeMediaDurationSeconds,
  });

  await listen(server, port);
  stopOnSignals(server, jobRunner);

  const origin = isDevMode ? DEV_SERVER_ORIGIN : `http://${UI_HOST}:${port}`;
  console.log(`UI running at ${buildSessionUrl({ origin, token })}`);
  console.log('Press Ctrl+C to stop.');
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', (error) => {
      reject(error.code === 'EADDRINUSE'
        ? new Error(`Port ${port} is already in use. Pass --port <n> to use another.`)
        : error);
    });
    server.listen(port, UI_HOST, resolve);
  });
}

/**
 * Runs before the handlers src/recorder.js registers at import time, which would exit with code 1;
 * stopping the UI server with Ctrl+C is a normal shutdown.
 */
function stopOnSignals(server, jobRunner) {
  const shutdown = () => {
    console.log('Stopping UI server...');
    jobRunner.stop();
    server.closeAllConnections();
    server.close();
    process.exit(0);
  };

  process.prependOnceListener('SIGINT', shutdown);
  process.prependOnceListener('SIGTERM', shutdown);
}
