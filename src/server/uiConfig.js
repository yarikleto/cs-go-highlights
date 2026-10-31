import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_UI_CONFIG = deepFreeze({
  paths: {
    demos: './temp/demos',
    output: './temp/output',
    hlae: 'C:\\Program Files (x86)\\HLAE\\hlae.exe',
    csgo: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive',
  },
  detection: {
    maxDelay: 15,
    minSeriesKills: 3,
    minEnemies: 2,
  },
  padding: {
    before: 4,
    after: 5,
  },
  speedup: {
    startDelay: 2,
    bufferAroundKills: 2,
    minGapDuration: 4,
  },
  slowmo: {
    duration: 1,
    factor: 0.6,
  },
  postprocess: {
    speedupMultiplier: 3,
    showOverlay: true,
  },
});

export function loadUiConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return structuredClone(DEFAULT_UI_CONFIG);
  }

  const content = fs.readFileSync(configPath, 'utf8');
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`${configPath} is not valid JSON (${error.message}). Fix or delete it.`);
  }
}

export function saveUiConfig(configPath, config) {
  if (!isPlainObject(config)) {
    throw new Error('config must be an object');
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
}
