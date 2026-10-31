import test from 'node:test';
import assert from 'node:assert/strict';
import { joinSavePath, visibleEntries, withDefaultExtension } from './filePicker.js';

const entries = [
  { name: 'demos', isDirectory: true },
  { name: '.git', isDirectory: true },
  { name: 'CLIP.MP4', isDirectory: false },
  { name: 'notes.txt', isDirectory: false },
  { name: '.env', isDirectory: false },
];

test('visibleEntries folder mode shows only directories', () => {
  assert.deepEqual(visibleEntries(entries, { mode: 'folder' }).map(entry => entry.name), ['demos']);
});

test('visibleEntries filters files by extension case-insensitively', () => {
  assert.deepEqual(
    visibleEntries(entries, { mode: 'file', extensions: ['mp4'] }).map(entry => entry.name),
    ['demos', 'CLIP.MP4'],
  );
});

test('visibleEntries accepts extensions written with a leading dot', () => {
  assert.deepEqual(
    visibleEntries(entries, { mode: 'files', extensions: ['.txt'] }).map(entry => entry.name),
    ['demos', 'notes.txt'],
  );
});

test('visibleEntries shows every file when no extensions are given', () => {
  assert.deepEqual(
    visibleEntries(entries, { mode: 'save-file' }).map(entry => entry.name),
    ['demos', 'CLIP.MP4', 'notes.txt'],
  );
});

test('visibleEntries hides dotfiles', () => {
  const names = visibleEntries(entries, { mode: 'file' }).map(entry => entry.name);
  assert.equal(names.includes('.git'), false);
  assert.equal(names.includes('.env'), false);
});

test('withDefaultExtension appends the first extension', () => {
  assert.equal(withDefaultExtension('final', ['mp4', 'mkv']), 'final.mp4');
});

test('withDefaultExtension keeps a name that already has an allowed extension', () => {
  assert.equal(withDefaultExtension('final.MP4', ['mp4']), 'final.MP4');
  assert.equal(withDefaultExtension('final.mkv', ['.mp4', '.mkv']), 'final.mkv');
});

test('withDefaultExtension leaves names alone without extensions', () => {
  assert.equal(withDefaultExtension('final', []), 'final');
});

test('joinSavePath uses the given separator', () => {
  assert.equal(joinSavePath('C:\\out', 'a.mp4', '\\'), 'C:\\out\\a.mp4');
  assert.equal(joinSavePath('/out/', 'a.mp4', '/'), '/out/a.mp4');
  assert.equal(joinSavePath('/', 'a.mp4', '/'), '/a.mp4');
});
