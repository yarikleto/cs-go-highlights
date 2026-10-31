import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value;
}

export function resolveProjectPath(value, name = 'path') {
  const input = assertNonEmptyString(value, name);
  return path.isAbsolute(input) ? input : path.resolve(PROJECT_ROOT, input);
}
