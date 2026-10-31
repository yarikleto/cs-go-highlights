import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PATHS, MUSIC, TEMP_DIR } from '../config.js';

const require = createRequire(import.meta.url);
const COMMANDS = require('./commands.json');
const FLOWS = require('./flows.json');

const RELATIVE_PATH = /(?:^|[\s("'])(\.\/[\w./-]+)/g;

function collectStrings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectStrings);
  return [];
}

function collectRelativePaths(value) {
  return collectStrings(value).flatMap(text => [...text.matchAll(RELATIVE_PATH)].map(match => match[1]));
}

function isInsideTemp(relativePath) {
  return relativePath === TEMP_DIR || relativePath.startsWith(`${TEMP_DIR}/`);
}

function assertInsideTemp(paths) {
  assert.ok(paths.length > 0, 'expected to find relative paths');
  const outside = paths.filter(relativePath => !isInsideTemp(relativePath));
  assert.deepEqual(outside, []);
}

test('TEMP_DIR is the project-local ./temp folder', () => {
  assert.equal(TEMP_DIR, './temp');
});

test('every relative path in commands.json lives inside the temp folder', () => {
  assertInsideTemp(collectRelativePaths(COMMANDS));
});

test('every relative path in flows.json lives inside the temp folder', () => {
  assertInsideTemp(collectRelativePaths(FLOWS));
});

test('default data paths in config live inside the temp folder', () => {
  assertInsideTemp(collectRelativePaths({ ...PATHS, musicFolder: MUSIC.defaultFolder }));
});
