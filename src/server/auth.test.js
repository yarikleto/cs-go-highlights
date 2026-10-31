import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedHostsFor,
  allowedOriginsFor,
  buildSessionUrl,
  createSessionToken,
  isAllowedHost,
  isAllowedOrigin,
  isValidToken,
  readCookie,
  sessionCookieHeader,
} from './auth.js';
import { DEV_SERVER_ORIGIN, SESSION_COOKIE } from './constants.js';

test('createSessionToken returns 64 hex characters and differs per call', () => {
  const token = createSessionToken();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.notEqual(token, createSessionToken());
});

test('buildSessionUrl points at the session route with the token', () => {
  assert.equal(
    buildSessionUrl({ origin: 'http://127.0.0.1:4280', token: 'abc' }),
    'http://127.0.0.1:4280/session?token=abc',
  );
});

test('isAllowedHost accepts loopback hosts on the server port', () => {
  assert.equal(isAllowedHost('127.0.0.1:4280', allowedHostsFor(4280)), true);
  assert.equal(isAllowedHost('localhost:4280', allowedHostsFor(4280)), true);
});

test('isAllowedHost rejects other hosts, ports and a missing header', () => {
  assert.equal(isAllowedHost('evil.test:4280', allowedHostsFor(4280)), false);
  assert.equal(isAllowedHost('127.0.0.1:9999', allowedHostsFor(4280)), false);
  assert.equal(isAllowedHost(undefined, allowedHostsFor(4280)), false);
});

test('isAllowedOrigin accepts a missing origin', () => {
  assert.equal(isAllowedOrigin(undefined, allowedOriginsFor(4280, [])), true);
});

test('isAllowedOrigin accepts the server origin', () => {
  assert.equal(isAllowedOrigin('http://127.0.0.1:4280', allowedOriginsFor(4280, [])), true);
});

test('isAllowedOrigin rejects the dev origin unless it is explicitly allowed', () => {
  assert.equal(isAllowedOrigin('http://localhost:5173', allowedOriginsFor(4280, [])), false);
  assert.equal(isAllowedOrigin('http://localhost:5173', allowedOriginsFor(4280, [DEV_SERVER_ORIGIN])), true);
});

test('readCookie finds the named cookie among others', () => {
  assert.equal(readCookie('a=1; csgo_highlights_session=abc', SESSION_COOKIE), 'abc');
  assert.equal(readCookie(undefined, SESSION_COOKIE), undefined);
  assert.equal(readCookie('a=1', SESSION_COOKIE), undefined);
});

test('isValidToken accepts only the exact token', () => {
  const token = createSessionToken();
  assert.equal(isValidToken(token, token), true);
  assert.equal(isValidToken('short', token), false);
  assert.equal(isValidToken(undefined, token), false);
  assert.equal(isValidToken(`${token.slice(0, -1)}x`, token), false);
});

test('sessionCookieHeader is HttpOnly and SameSite=Strict for the whole site', () => {
  assert.equal(
    sessionCookieHeader('abc'),
    'csgo_highlights_session=abc; HttpOnly; SameSite=Strict; Path=/',
  );
});
