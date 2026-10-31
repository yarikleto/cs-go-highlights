const PARAM_PREFIX = '$';

export function buildCliArgs({ cliPath, commandId, options }) {
  const args = [cliPath, commandId];

  for (const [name, value] of Object.entries(options)) {
    if (value === true) {
      args.push(`--${name}`);
    } else if (hasValue(value)) {
      args.push(`--${name}`, String(value));
    }
  }

  return args;
}

/** Replaces "$paramName" option values with the user's flow params; options whose param is empty are dropped. */
export function resolveFlowOptions(options, params) {
  const resolved = {};

  for (const [name, value] of Object.entries(options)) {
    if (typeof value === 'string' && value.startsWith(PARAM_PREFIX)) {
      const paramValue = params[value.slice(PARAM_PREFIX.length)];
      if (paramValue === undefined || paramValue === '') continue;
      resolved[name] = paramValue;
    } else {
      resolved[name] = value;
    }
  }

  return resolved;
}

function hasValue(value) {
  return value !== false && value !== null && value !== undefined && value !== '';
}
