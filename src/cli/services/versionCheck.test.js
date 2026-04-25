import test from 'node:test';
import assert from 'node:assert/strict';
import { VersionMismatchError } from './versionCheck.js';

test('VersionMismatchError carries reasons array and joins them in message', () => {
  const err = new VersionMismatchError(['reason A', 'reason B']);
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'VersionMismatchError');
  assert.deepEqual(err.reasons, ['reason A', 'reason B']);
  assert.match(err.message, /reason A/);
  assert.match(err.message, /reason B/);
});

test('VersionMismatchError requires at least one reason', () => {
  assert.throws(() => new VersionMismatchError([]), /at least one reason/i);
});
