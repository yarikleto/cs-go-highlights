const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('./paths');

const CONFIG_PATH = path.join(PROJECT_ROOT, 'electron-config.json');

const DEFAULT_CONFIG = {
  paths: {
    demos: './demos',
    output: './output',
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
};

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return cloneDefaultConfig();
  }

  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error('Error loading config:', e);
    return cloneDefaultConfig();
  }
}

function saveConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('config must be an object');
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = {
  CONFIG_PATH,
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
};
