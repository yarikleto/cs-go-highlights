import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOptionDefault } from './resolveOptionDefault.js';

test('returns opt.default when option has no globalConfigKey', () => {
  const opt = { name: 'demos', default: './demos' };
  const globalConfig = { paths: { demos: '/from/global' } };
  assert.equal(resolveOptionDefault(opt, globalConfig), './demos');
});

test('returns opt.default when globalConfig is null', () => {
  const opt = { name: 'demos', default: './demos', globalConfigKey: 'paths.demos' };
  assert.equal(resolveOptionDefault(opt, null), './demos');
});

test('returns globalConfig value when key exists and is non-empty', () => {
  const opt = { name: 'demos', default: './demos', globalConfigKey: 'paths.demos' };
  const globalConfig = { paths: { demos: '/custom/demos' } };
  assert.equal(resolveOptionDefault(opt, globalConfig), '/custom/demos');
});

test('falls back to opt.default when globalConfig key resolves to undefined', () => {
  const opt = { name: 'demos', default: './demos', globalConfigKey: 'paths.demos' };
  const globalConfig = { paths: {} };
  assert.equal(resolveOptionDefault(opt, globalConfig), './demos');
});

test('falls back to opt.default when globalConfig key resolves to null', () => {
  const opt = { name: 'np', default: 100, globalConfigKey: 'gameVersion.networkProtocol' };
  const globalConfig = { gameVersion: { networkProtocol: null } };
  assert.equal(resolveOptionDefault(opt, globalConfig), 100);
});

test('falls back to opt.default when globalConfig value is empty string', () => {
  const opt = { name: 'demos', default: './demos', globalConfigKey: 'paths.demos' };
  const globalConfig = { paths: { demos: '' } };
  assert.equal(resolveOptionDefault(opt, globalConfig), './demos');
});

test('preserves number 0 as a real value (not treated as empty)', () => {
  const opt = { name: 'count', default: 5, globalConfigKey: 'detection.minSeriesKills' };
  const globalConfig = { detection: { minSeriesKills: 0 } };
  assert.equal(resolveOptionDefault(opt, globalConfig), 0);
});

test('preserves boolean false as a real value', () => {
  const opt = { name: 'overlay', default: true, globalConfigKey: 'postprocess.showOverlay' };
  const globalConfig = { postprocess: { showOverlay: false } };
  assert.equal(resolveOptionDefault(opt, globalConfig), false);
});

test('handles deeply nested dotted paths', () => {
  const opt = { name: 'x', default: 'fallback', globalConfigKey: 'a.b.c.d' };
  const globalConfig = { a: { b: { c: { d: 'deep' } } } };
  assert.equal(resolveOptionDefault(opt, globalConfig), 'deep');
});

test('returns opt.default when intermediate path is null', () => {
  const opt = { name: 'x', default: 'fallback', globalConfigKey: 'a.b.c' };
  const globalConfig = { a: null };
  assert.equal(resolveOptionDefault(opt, globalConfig), 'fallback');
});
