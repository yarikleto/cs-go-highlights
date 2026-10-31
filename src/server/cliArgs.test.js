import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCliArgs, resolveFlowOptions } from './cliArgs.js';

test('buildCliArgs turns options into CLI flags', () => {
  assert.deepEqual(
    buildCliArgs({ cliPath: '/cli.js', commandId: 'top', options: { count: 10, force: true, dry: false, out: '' } }),
    ['/cli.js', 'top', '--count', '10', '--force'],
  );
});

test('buildCliArgs skips null and undefined values', () => {
  assert.deepEqual(
    buildCliArgs({ cliPath: '/cli.js', commandId: 'merge', options: { a: null, b: undefined } }),
    ['/cli.js', 'merge'],
  );
});

test('buildCliArgs keeps paths with spaces as single arguments', () => {
  assert.deepEqual(
    buildCliArgs({ cliPath: '/cli.js', commandId: 'merge', options: { clips: 'C:\\My Clips' } }),
    ['/cli.js', 'merge', '--clips', 'C:\\My Clips'],
  );
});

test('resolveFlowOptions substitutes $params and drops missing ones', () => {
  assert.deepEqual(
    resolveFlowOptions({ demos: '$archive', fixed: 1, missing: '$nope', empty: '$blank' }, { archive: 'a.zip', blank: '' }),
    { demos: 'a.zip', fixed: 1 },
  );
});
