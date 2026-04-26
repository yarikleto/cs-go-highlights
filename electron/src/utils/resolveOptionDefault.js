/**
 * @fileoverview Compute the "effective default" for a commands.json option.
 *
 * Pure helper used by Electron form pages so user-set Global Config values
 * (electron-config.json) seed per-command form fields. When an option has a
 * `globalConfigKey: "section.field"` annotation and the global config has a
 * non-empty value at that path, that value wins; otherwise we fall back to
 * the static `opt.default` from commands.json.
 */

/**
 * @param {{name: string, default?: any, globalConfigKey?: string}} opt
 *   Option definition from commands.json.
 * @param {Object|null|undefined} globalConfig Loaded electron-config.json (or null while loading).
 * @returns {*} Effective default value.
 */
export function resolveOptionDefault(opt, globalConfig) {
  if (opt.globalConfigKey && globalConfig) {
    const fromGlobal = getByPath(globalConfig, opt.globalConfigKey);
    if (fromGlobal !== undefined && fromGlobal !== null && fromGlobal !== '') {
      return fromGlobal;
    }
  }
  return opt.default;
}

function getByPath(obj, dottedPath) {
  return dottedPath
    .split('.')
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}
