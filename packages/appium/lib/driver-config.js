// @ts-check

import _ from 'lodash';
import {ExtensionConfig} from './extension-config';
import {DRIVER_TYPE} from './constants';
/**
 * @extends {ExtensionConfig<DriverType>}
 */
export class DriverConfig extends ExtensionConfig {
  /**
   * A mapping of `APPIUM_HOME` values to {@link DriverConfig} instances.
   * Each `APPIUM_HOME` should only have one associated `DriverConfig` instance.
   * @type {Record<string,DriverConfig>}
   * @private
   */
  static _instances = {};

  /**
   * Call {@link DriverConfig.getInstance} instead.
   * @private
   * @param {import('./manifest-io').ManifestIO} io - IO object
   * @param {DriverConfigOptions} [opts]
   */
  constructor (io, {logFn, extData} = {}) {
    super(DRIVER_TYPE, io, logFn);
    /** @type {Set<string>} */
    this.knownAutomationNames = new Set();

    if (extData) {
      this.validate(extData);
    }
  }

  /**
   * Checks extensions for problems
   * @param {ExtRecord<DriverType>} exts
   */
  validate (exts) {
    this.knownAutomationNames.clear();
    return super.validate(exts);
  }

  /**
   * Creates a new DriverConfig
   *
   * Warning: overwrites any existing `DriverConfig` for the given `appiumHome` prop of the `io` parameter.
   * @param {import('./manifest-io').ManifestIO} io
   * @param {DriverConfigOptions} [opts]
   * @returns {DriverConfig}
   */
  static create (io, {extData, logFn} = {}) {
    const instance = new DriverConfig(io, {logFn, extData});
    DriverConfig._instances[io.appiumHome] = instance;
    return instance;
  }

  /**
   * Gets an existing instance of {@link DriverConfig} based value of `io.appiumHome`
   * @param {import('./manifest-io').ManifestIO} io - IO object
   * @returns {DriverConfig}
   */
  static getInstance (io) {
    return DriverConfig._instances[io.appiumHome];
  }

  /**
   * @param {ManifestDriverData} extData
   * @returns {import('./extension-config').Problem[]}
   */
  getConfigProblems (extData) {
    const problems = [];
    const {platformNames, automationName} = extData;

    if (!_.isArray(platformNames)) {
      problems.push({
        err: 'Missing or incorrect supported platformNames list.',
        val: platformNames
      });
    } else {
      if (_.isEmpty(platformNames)) {
        problems.push({
          err: 'Empty platformNames list.',
          val: platformNames
        });
      } else {
        for (const pName of platformNames) {
          if (!_.isString(pName)) {
            problems.push({err: 'Incorrectly formatted platformName.', val: pName});
          }
        }
      }
    }

    if (!_.isString(automationName)) {
      problems.push({err: 'Missing or incorrect automationName', val: automationName});
    }

    if (this.knownAutomationNames.has(automationName)) {
      problems.push({
        err: 'Multiple drivers claim support for the same automationName',
        val: automationName
      });
    }

    // should we retain the name at the end of this function, once we've checked there are no problems?
    this.knownAutomationNames.add(automationName);

    return problems;
  }

  /**
   * @template { {version: ManifestDriverData['version'], automationName: ManifestDriverData['automationName']} } EData
   * @param {ExtName<DriverType>} driverName
   * @param {EData} extData
   * @returns {string}
   */
  extensionDesc (driverName, {version, automationName}) {
    return `${driverName}@${version} (automationName '${automationName}')`;
  }
}

/**
 * @typedef {Object} DriverConfigOptions
 * @property {import('./extension-config').ExtensionLogFn} [logFn] - Optional logging function
 * @property {Manifest['drivers']} [extData] - Extension data
 */

/**
 * @typedef {import('./extension-config').ExternalDriverData} ExternalDriverData
 * @typedef {import('./extension-config').ManifestDriverData} ManifestDriverData
 * @typedef {import('./extension-config').Manifest} Manifest
 * @typedef {import('./extension-config').DriverType} DriverType
 */

/**
 * @template T
 * @typedef {import('./extension-config').ExtRecord<T>} ExtRecord
 */

/**
 * @template T
 * @typedef {import('./extension-config').ExtName<T>} ExtName
 */

