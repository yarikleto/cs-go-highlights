import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRange } from './range.js';

test('parseRange returns null without a header', () => {
  assert.equal(parseRange(undefined, 1000), null);
});

test('parseRange reads an explicit range', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
});

test('parseRange reads an open-ended range to the last byte', () => {
  assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 });
});

test('parseRange reads a suffix range', () => {
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
});

test('parseRange clamps the end to the file size', () => {
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { start: 900, end: 999 });
});

test('parseRange marks a start past the end as invalid', () => {
  assert.deepEqual(parseRange('bytes=2000-', 1000), { invalid: true });
});

test('parseRange ignores malformed headers', () => {
  assert.equal(parseRange('items=0-1', 1000), null);
  assert.equal(parseRange('bytes=-', 1000), null);
});
