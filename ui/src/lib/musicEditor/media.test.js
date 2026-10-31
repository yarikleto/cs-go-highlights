import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToMediaUrl } from './media.js';

test('pathToMediaUrl encodes Windows paths into the media route', () => {
  assert.equal(pathToMediaUrl('C:\\Clips\\my clip #1.mp4'), '/media?path=C%3A%5CClips%5Cmy%20clip%20%231.mp4');
});

test('pathToMediaUrl returns empty for empty input', () => {
  assert.equal(pathToMediaUrl(''), '');
  assert.equal(pathToMediaUrl(null), '');
});
