/**
 * Entry point for this package; provides several public APIs to interact with Appium extension manifest files (`extensions.yaml`).
 */

/* eslint-disable promise/no-native */

import { fs } from '@appium/support';
import _ from 'lodash';
import path from 'path';
import { logger } from './log.mjs';
import { AppiumExtManifest, MANIFEST_BASENAME } from './manifest.mjs';
import { applyPatch, createPatch } from './patch.mjs';
import { resolveAppiumHome } from './system.mjs';
import { hasLocalAppium, isExtension, readPackageInDir } from './utils.mjs';
export { DEFAULT_APPIUM_HOME } from './system.mjs';
export * as utils from './utils.mjs';
export { MANIFEST_BASENAME };

/**
 * For typecasting
 * @type {import('klaw')}
 */
const walk = fs.walk;

/**
 * For typecasting
 * @type {(path: string) => Promise<boolean>}
*/
const exists = fs.exists;

/**
 * Default depth to search in directory tree for whatever it is we're looking for.
 *
 * It's 4 because smaller numbers didn't work.
 */
const DEFAULT_SEARCH_DEPTH = 4;

/**
 * Path to manifest when `$APPIUM_HOME` contains a Node.js project.
 */
export const LOCAL_RELATIVE_MANIFEST_PATH = path.join(
  'node_modules',
  '.cache',
  'appium',
  MANIFEST_BASENAME,
);

/**
 * Just resolves with whatever `APPIUM_HOME` is.
 * @param {string} [cwd] - Current working directory
 * @returns {Promise<string>}
 */
export async function findAppiumHome (cwd = process.cwd()) {
  const {home} = await resolveAppiumHome(cwd);
  return home;
}

/**
 * Default options for {@link findManifest}.
 * @type {Readonly<import('klaw').Options>}
 */
const DEFAULT_FIND_MANIFEST_OPTS = Object.freeze({
  depthLimit: DEFAULT_SEARCH_DEPTH,
  filter: (filepath) => path.basename(filepath) === MANIFEST_BASENAME,
});

/**
 * Default options for {@link findExtensions}.
 * @type {Readonly<import('klaw').Options>}
 */
const DEFAULT_FIND_EXTENSIONS_OPTS = Object.freeze({
  depthLimit: DEFAULT_SEARCH_DEPTH,
  filter: (filepath) => !path.basename(filepath).startsWith('.'),
});

/**
 * Tries to find an `extensions.yaml` under `cwd`. Returns path to the first one it finds.
 * @param {string} cwd - Typically `$APPIUM_HOME`
 * @public
 * @returns {Promise<string|undefined>} Manifest path, if found
 */
export async function findManifest (cwd) {
  logger.info('Searching for %s in %s...', MANIFEST_BASENAME, cwd);
  let manifestPath;
  let childManifestPath = path.join(cwd, MANIFEST_BASENAME);
  // some premature optimization here
  if (await exists(childManifestPath)) {
    manifestPath = childManifestPath;
  } else {
    // finds first `extensions.yaml` in tree
    for await (let {path} of walk(cwd, DEFAULT_FIND_MANIFEST_OPTS)) {
      manifestPath = path;
      break;
    }
  }
  if (manifestPath) {
    logger.ok('Found %s', manifestPath);
  } else {
    logger.info('No %s found within %s', MANIFEST_BASENAME, cwd);
  }
  return manifestPath;
}

/**
 * Figure out manifest path based on options.
 *
 * Returns `manifestPath` if {@link FindExtensionsOptions.manifestPath `opts.manifestPath`} is defined.
 * @private
 * @param {string} cwd - Typically `$APPIUM_HOME`
 * @param {FindExtensionsOptions} [opts] - Options
 * @returns {Promise<string>}
 */
export async function getManifestPath (cwd, {forceLocal = false, manifestPath} = {}) {
  return manifestPath ?? (
    forceLocal || (await hasLocalAppium(cwd))
      ? path.join(cwd, LOCAL_RELATIVE_MANIFEST_PATH)
      : path.join(cwd, MANIFEST_BASENAME));
}

/**
 * Given a `cwd`, locate all installed extensions within and return an object representing the manifest.
 *
 * If nothing is installed, the {@link AppiumExtManifest manifest object} will contain no {@link AppiumExtManifest._data data}.
 *
 * If a `package.json` is detected in `cwd` (and no {@link FindExtensionsOptions.manifestPath `opts.manifestPath`} is defined), and `appium` is within its dependencies, we will assume the manifest should be stored "locally"; see {@link LOCAL_RELATIVE_MANIFEST_PATH}.
 *
 * @public
 * @todo Reduce default depth to 2 when `appium` adopts `npm install --global-style`
 * @param {string} cwd - Current working directory (typically `$APPIUM_HOME`)
 * @param {FindExtensionsOptions} [opts] - Options
 * @returns {Promise<AppiumExtManifest>} {@link AppiumExtManifest} object
 */
export async function findInstalledExtensions (
  cwd,
  {forceLocal = false, depthLimit = DEFAULT_SEARCH_DEPTH, manifestPath} = {},
) {
  manifestPath = await getManifestPath(cwd, {forceLocal, manifestPath});

  const manifest = AppiumExtManifest.from(cwd, manifestPath);

  const walkOpts = _.defaults({depthLimit}, DEFAULT_FIND_EXTENSIONS_OPTS);
  for await (const {stats, path: filepath} of walk(cwd, walkOpts)) {
    if (stats.isDirectory()) {
      const pkg = await readPackageInDir(filepath);
      if (pkg && isExtension(pkg)) {
        manifest.addExtension(pkg, path.join(filepath, 'package.json'));
      }
    }
  }
  return manifest;
}

/**
 * Returns a representation of a manifest based on an on-disk `extensions.yaml`.
 *
 * Does not inspect the directory hierarchy for installed extensions.
 *
 * @public
 * @param {string} cwd - Typically `$APPIUM_HOME`
 * @param {FindExtensionsOptions} [opts] - Options
 * @returns {Promise<AppiumExtManifest>} {@link AppiumExtManifest} object
 */
export async function findRequiredExtensions (
  cwd, {forceLocal = false, manifestPath} = {}
) {
  manifestPath = await getManifestPath(cwd, {forceLocal, manifestPath});

  return await AppiumExtManifest.fromManifestFile(cwd, manifestPath);
}

/**
 * Finds all installed extensions _and_ the expected extensions (as declared in an on-disk manifest).
 *
 * Either or both of the returned manifests may contain no data.
 * @public
 * @param {string} cwd - Typically `$APPIUM_HOME`
 * @param {FindExtensionsOptions} [opts] - Options
 * @returns {Promise<{actual: AppiumExtManifest, expected: AppiumExtManifest}>} An object containing a representation of the "actual" manifest (reflecting directory hierarchy) and a representation of the "expected" manifest (`extensions.yaml` context).
 */
export async function findExtensions (cwd, opts = {}) {
  const [actual, expected] = await Promise.all([findInstalledExtensions(cwd, opts), findRequiredExtensions(cwd, opts)]);
  return {actual, expected};
}

/**
 * If an `extensions.yaml` is out-of-date with respect to what's actually installed on disk, update `extensions.yaml` to reflect reality.
 *
 * This function _may_ overwrite `extensions.yaml` in place.
 *
 * @public
 * @param {string} appiumHome - Path to Appium home directory ($APPIUM_HOME)
 * @param {string} [manifestPath] - Explicit path to manifest file. If not provided, it will be searched for in `appiumHome`.
 * @param {FixExtensionManifestOptions} [opts] - Options
 * @returns {Promise<boolean>} - `true` if the manifest was successfully modified
 */
export async function fixExtensionManifest (
  appiumHome,
  manifestPath,
  {dryRun = false} = {},
) {
  let didWrite = dryRun;
  if (!manifestPath) {
    manifestPath = await findManifest(appiumHome);
  }
  const {actual, expected} = await findExtensions(appiumHome, {manifestPath});
  const {data: actualExtData} = actual;
  const {data: expectedExtData} = expected;
  const patch = createPatch(expectedExtData, actualExtData);
  if (_.isEmpty(patch)) {
    logger.ok(
      'Manifest at %s is up-to-date; no changes necessary',
      manifestPath,
    );
  } else {
    const errors = applyPatch(expectedExtData, patch);
    if (_.isEmpty(errors)) {
      if (dryRun) {
        logger.warn(
          'DRY RUN: would have written manifest at %s: %O',
          expected.filepath,
          expectedExtData,
        );
      } else {
        didWrite = await expected.write();
      }
    } else {
      // XXX: unsure how actionable this is
      logger.error(
        'Could not apply patch to extension manifest:\n%s',
        _.map(errors, 'message').join(', '),
      );
    }
  }
  return didWrite;
}

/**
 * Options for {@link fixExtensionManifest}
 * @typedef {Object} FixExtensionManifestOptions
 * @property {boolean} [dryRun] - If `true`, do not actually modify any files on disk
 */

/**
 * @typedef {import('./manifest.mjs').Manifest} Manifest
 * @typedef {import('./manifest.mjs').Manifest} ExtensionsData
 */

/**
 * Options for various functions here
 * @typedef {Object} FindExtensionsOptions
 * @property {boolean} [forceLocal=false] - Force "local" manifest path (`$APPIUM_HOME/node_modules/.cache/appium/extensions.yml`)
 * @property {number} [depthLimit] - Directory depth from `$APPIUM_HOME` to search for packages
 * @property {string} [manifestPath] - Explicit path to `extensions.yml`; overrides `forceLocal`)
 */
