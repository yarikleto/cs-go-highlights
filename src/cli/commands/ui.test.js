import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertUiBuilt, parsePort } from './ui.js';

test('parsePort accepts 4280', () => {
  assert.equal(parsePort('4280'), 4280);
  assert.equal(parsePort(4280), 4280);
});

test('parsePort rejects 0, 70000, fractions and text', () => {
  for (const value of ['0', '70000', '42.5', 'abc', '']) {
    assert.throws(() => parsePort(value), /--port must be an integer between 1 and 65535/, `value ${value}`);
  }
});

test('assertUiBuilt throws an actionable error when index.html is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-dist-'));
  try {
    assert.throws(() => assertUiBuilt(dir), /UI build not found at ui\/dist\. Run "npm run build" first\./);
    fs.writeFileSync(path.join(dir, 'index.html'), '');
    assert.doesNotThrow(() => assertUiBuilt(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
