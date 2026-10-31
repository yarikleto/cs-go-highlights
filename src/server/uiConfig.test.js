import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_UI_CONFIG, loadUiConfig, saveUiConfig } from './uiConfig.js';

function withTempDir(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-config-'));
  try {
    return callback(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('loadUiConfig returns defaults when the file is missing', () => {
  withTempDir((dir) => {
    const config = loadUiConfig(path.join(dir, 'missing.json'));
    assert.deepEqual(config, DEFAULT_UI_CONFIG);

    config.paths.demos = 'changed';
    assert.equal(DEFAULT_UI_CONFIG.paths.demos, './temp/demos');
  });
});

test('saveUiConfig then loadUiConfig round-trips', () => {
  withTempDir((dir) => {
    const configPath = path.join(dir, 'nested', 'deeper', 'ui-config.json');
    const config = { ...DEFAULT_UI_CONFIG, padding: { before: 1, after: 2 } };

    saveUiConfig(configPath, config);

    assert.deepEqual(loadUiConfig(configPath), config);
  });
});

test('loadUiConfig throws an actionable error for invalid JSON', () => {
  withTempDir((dir) => {
    const configPath = path.join(dir, 'ui-config.json');
    fs.writeFileSync(configPath, '{ not json');

    assert.throws(() => loadUiConfig(configPath), /not valid JSON.*Fix or delete it/);
  });
});

test('saveUiConfig rejects arrays', () => {
  withTempDir((dir) => {
    assert.throws(() => saveUiConfig(path.join(dir, 'ui-config.json'), []), /config must be an object/);
  });
});
