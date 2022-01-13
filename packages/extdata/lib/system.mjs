/* eslint-disable promise/no-native */
import {fs, system} from '@appium/support';
import execa from 'execa';
import _ from 'lodash';
import path from 'path';
import resolveFrom from 'resolve-from';
import {LOCAL_RELATIVE_MANIFEST_PATH} from './index.mjs';
import {
  appiumDependencyVersion,
  hasLocalAppium,
  readPackageInDir,
} from './utils.mjs';

export const {DEFAULT_APPIUM_HOME} = system;

/**
 * @type {import('which')}
 */
const which = fs.which;

/**
 * @type {import('fs/promises').realpath}
 */
const realpath = fs.realpath;

/**
 * Finds an installation of `appium` in some directory.
 * @param {string} cwd - Directory ostensbibly containing `node_modules/appium`
 * @returns {Promise<AppiumLocalExecutableStatus>}
 */
async function locateAppiumInDir (cwd) {
  try {
    const appiumPkgDir = path.dirname(resolveFrom(cwd, 'appium/package.json'));
    const appiumPkg = await readPackageInDir(appiumPkgDir);
    if (appiumPkg) {
      const executable = appiumPkg.bin?.appium;
      if (executable) {
        return {
          localExecutableLink: path.join(appiumPkgDir, executable),
          localExecutable: path.join(
            cwd,
            'node_modules',
            '.bin',
            system.isWindows() ? 'appium.cmd' : 'appium',
          ),
        };
      }
    }
  } catch {}
  return {};
}

/**
 * Finds `appium` in a `package.json` file, if `cwd` contains a `package.json` file.
 * @param {string} cwd - Directory to search for `package.json` file
 * @returns {Promise<AppiumDependencyStatus>}
 */
async function locateAppiumDependency (cwd) {
  const pkg = await readPackageInDir(cwd);
  /** @type {string|undefined} */
  let dependencyVersion;
  if (pkg && (await hasLocalAppium(pkg))) {
    dependencyVersion = appiumDependencyVersion(pkg);
  }
  return {dependencyVersion};
}

/**
 * Get system information about Appium install(s).
 * @param {string} [cwd]
 * @returns {Promise<AppiumExecutableStatus>}
 */
export async function getAppiumExecutableInfo (cwd = process.cwd()) {
  const [
    {envExecutable, envExecutableLink},
    {localExecutable, localExecutableLink},
    {globalExecutable, globalExecutableLink},
    {dependencyVersion},
  ] = await Promise.all([
    locateAppiumInEnv(),
    locateAppiumInDir(cwd),
    locateGlobalAppium(),
    locateAppiumDependency(cwd),
  ]);
  const result = _.mapValues(
    {
      envExecutable,
      envExecutableLink,
      localExecutable,
      localExecutableLink,
      globalExecutable,
      globalExecutableLink,
    },
    (value) => {
      if (!_.isUndefined(value)) {
        return path.resolve(cwd, value);
      }
    },
  );

  return {...result, cwd, dependencyVersion};
}

/**
 * Finds `appium` in `$PATH`, if it's in `$PATH`.
 * @returns {Promise<AppiumLocalExecutableStatus & AppiumDependencyStatus & {cwd: string}>}
 */
export async function getLocalAppiumInfo (cwd = process.cwd()) {
  const [dirResult, {dependencyVersion}] =
    await Promise.all([locateAppiumInDir(cwd), locateAppiumDependency(cwd)]);

  const result = _.mapValues(
    dirResult,
    (value) => {
      if (!_.isUndefined(value)) {
        return path.resolve(cwd, value);
      }
    },
  );
  return {...result, cwd, dependencyVersion};
}

/**
 * Finds `appium` in `$PATH`, if it's in `$PATH`.
 * @returns {Promise<AppiumEnvExecutableStatus>}
 */
async function locateAppiumInEnv () {
  /**
   * @type {string|undefined}
   */
  let envExecutable;
  /**
   * @type {string|undefined}
   */
  let envExecutableLink;
  try {
    envExecutable = await which('appium');
  } catch {}
  if (envExecutable) {
    try {
      envExecutableLink = await realpath(envExecutable);
    } catch {}
  }
  return {envExecutable, envExecutableLink};
}

/**
 * A best-effort try at resolving a globally-installed `appium` executable.
 *
 * Finding global installs of stuff is painful, and this won't likely work if someone installed `appium` via other means than `npm`.
 *
 * `npm` must be in `$PATH`.
 * @returns {Promise<AppiumGlobalExecutableStatus>}
 */
export async function locateGlobalAppium () {
  const {stdout} = await execa('npm', ['ls', '--global', '--json']);
  const {name, dependencies} = JSON.parse(stdout);
  let globalExecutable;
  let globalExecutableLink;
  if (dependencies?.appium) {
    if (dependencies.appium.resolved) {
      const result = await locateAppiumInDir(dependencies.appium.resolved);
      globalExecutable = result.localExecutable;
      globalExecutableLink = result.localExecutableLink;
    } else {
      const {stdout: prefix} = await execa('npm', ['config', 'get', 'prefix']);
      const result = await locateAppiumInDir(
        path.join(prefix, name, 'node_modules'),
      );
      globalExecutable = result.localExecutable;
      globalExecutableLink = result.localExecutableLink;
    }
  }
  return {globalExecutable, globalExecutableLink};
}

/**
 * Determines location of Appium's "home" dir
 * @param {string} cwd - Current working directory
 * @param {AppiumExecutableStatus} [status] - If we've already gotten data out of {@link getAppiumExecutableInfo}, we can pass it in here to avoid an extra call
 * @returns {Promise<AppiumHomeStatus>}
 */
export async function resolveAppiumHome (cwd, status) {
  if (process.env.APPIUM_HOME) {
    return {home: process.env.APPIUM_HOME, fromEnv: true};
  }
  status = status ?? (await getLocalAppiumInfo(cwd));
  if (status?.localExecutable || status?.dependencyVersion) {
    return {
      home: path.join(cwd, path.dirname(LOCAL_RELATIVE_MANIFEST_PATH)),
      fromEnv: false,
    };
  }
  return {home: DEFAULT_APPIUM_HOME, fromEnv: false};
}

/**
 * @typedef {Object} AppiumHomeStatus
 * @property {string} home - Path to APPIUM_HOME
 * @property {boolean} fromEnv - Whether `$APPIUM_HOME` was set in the environment
 */

/**
 * @typedef {Object} AppiumEnvExecutableStatus
 * @property {string} [envExecutable] - `appium` executable, as found in `$PATH`
 * @property {string} [envExecutableLink] - The file the `appium` executable is linked to
 */

/**
 * @typedef {Object} AppiumGlobalExecutableStatus
 * @property {string} [globalExecutable] - `appium` executable, as found in global `node_modules`
 * @property {string} [globalExecutableLink] - The file the `appium` executable, as found in global `node_modules`, is linked to
 */

/**
 * @typedef {Object} AppiumLocalExecutableStatus
 * @property {string} [localExecutable] - The path to the `appium` executable, as found within the CWD
 * @property {string} [localExecutableLink] - The file the `appium` executable, as found within the CWD, is linked to
 */

/**
 * @typedef {Object} AppiumDependencyStatus
 * @property {string} [dependencyVersion] - The path to the `appium` executable, as found within a `package.json` in the CWD
 */

/**
 * @typedef {Object} AppiumExecutableStatusFlags
 * @property {boolean} isDependency - Whether `appium` is a top-level dependency
 * @property {boolean} isGlobal - Whether the executable is globally installed
 */

/**
 * @typedef {AppiumGlobalExecutableStatus & AppiumEnvExecutableStatus & AppiumLocalExecutableStatus & AppiumDependencyStatus & {cwd: string} } AppiumExecutableStatus
 */
