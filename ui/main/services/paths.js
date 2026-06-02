const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value;
}

function resolveProjectPath(value, name = 'path') {
  const input = assertNonEmptyString(value, name);
  return path.isAbsolute(input) ? input : path.resolve(PROJECT_ROOT, input);
}

module.exports = {
  PROJECT_ROOT,
  assertNonEmptyString,
  resolveProjectPath,
};
