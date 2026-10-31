import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { PROJECT_ROOT, resolveProjectPath } from './paths.js';

test('resolveProjectPath keeps absolute paths', () => {
  const absolutePath = path.resolve('/somewhere/else');
  assert.equal(resolveProjectPath(absolutePath), absolutePath);
});

test('resolveProjectPath resolves relative paths against the project root', () => {
  assert.equal(resolveProjectPath('./temp'), path.join(PROJECT_ROOT, 'temp'));
});

test('resolveProjectPath rejects empty strings', () => {
  assert.throws(() => resolveProjectPath('  ', 'folder'), /folder must be a non-empty string/);
});

test('PROJECT_ROOT is the repository root', () => {
  assert.equal(PROJECT_ROOT, path.resolve(import.meta.dirname, '../..'));
});
