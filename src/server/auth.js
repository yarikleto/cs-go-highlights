import crypto from 'node:crypto';
import { SESSION_COOKIE } from './constants.js';

const LOOPBACK_HOSTNAMES = Object.freeze(['127.0.0.1', 'localhost']);
const TOKEN_BYTES = 32;

export function createSessionToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

export function buildSessionUrl({ origin, token }) {
  return `${origin}/session?token=${token}`;
}

export function allowedHostsFor(port) {
  return LOOPBACK_HOSTNAMES.map(hostname => `${hostname}:${port}`);
}

export function allowedOriginsFor(port, extraOrigins) {
  return [...allowedHostsFor(port).map(host => `http://${host}`), ...extraOrigins];
}

export function isAllowedHost(host, allowedHosts) {
  return typeof host === 'string' && allowedHosts.includes(host.toLowerCase());
}

export function isAllowedOrigin(origin, allowedOrigins) {
  return origin === undefined || allowedOrigins.includes(origin);
}

export function readCookie(cookieHeader, name) {
  if (!cookieHeader) return undefined;

  for (const pair of cookieHeader.split(';')) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) continue;
    if (pair.slice(0, separatorIndex).trim() === name) {
      return pair.slice(separatorIndex + 1).trim();
    }
  }

  return undefined;
}

export function isValidToken(candidate, token) {
  if (typeof candidate !== 'string') return false;

  const candidateBuffer = Buffer.from(candidate);
  const tokenBuffer = Buffer.from(token);
  return candidateBuffer.length === tokenBuffer.length && crypto.timingSafeEqual(candidateBuffer, tokenBuffer);
}

export function sessionCookieHeader(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`;
}
