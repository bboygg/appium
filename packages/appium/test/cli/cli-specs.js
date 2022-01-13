// transpile:mocha

import { env } from '@appium/support';
import { loadExtensions } from '../../lib/manifest-io';
import DriverCommand from '../../lib/cli/driver-command';
import sinon from 'sinon';

const { DEFAULT_APPIUM_HOME } = env;

describe('DriverCommand', function () {
  let config;
  const driver = 'fake';
  const pkgName = '@appium/fake-driver';
  let dc;

  before(async function () {
    config = (await loadExtensions(DEFAULT_APPIUM_HOME)).driverConfig;
    config.installedExtensions = {[driver]: {version: '1.0.0', pkgName}};
    dc = new DriverCommand({config, json: true});
  });

  describe('#checkForExtensionUpdate', function () {
    let npmMock;

    beforeEach(function () {
      npmMock = sinon.mock(dc.npm);
    });

    function setupDriverUpdate (curVersion, latestVersion, latestSafeVersion) {
      npmMock.expects('getLatestVersion')
        .once()
        .withExactArgs(pkgName)
        .returns(latestVersion);
      npmMock.expects('getLatestSafeUpgradeVersion')
        .once()
        .withExactArgs(pkgName, curVersion)
        .returns(latestSafeVersion);
    }

    it('should not return an unsafe update if it is same as safe update', async function () {
      setupDriverUpdate('1.0.0', '1.1.0', '1.1.0');
      await dc.checkForExtensionUpdate('fake').should.eventually.eql({
        current: '1.0.0',
        safeUpdate: '1.1.0',
        unsafeUpdate: null,
      });
      npmMock.verify();
    });

    it('should not return a safe update if there is not one', async function () {
      setupDriverUpdate('1.0.0', '2.0.0', null);
      await dc.checkForExtensionUpdate('fake').should.eventually.eql({
        current: '1.0.0',
        safeUpdate: null,
        unsafeUpdate: '2.0.0',
      });
      npmMock.verify();
    });

    it('should return both safe and unsafe update', async function () {
      setupDriverUpdate('1.0.0', '2.0.0', '1.5.3');
      await dc.checkForExtensionUpdate('fake').should.eventually.eql({
        current: '1.0.0',
        safeUpdate: '1.5.3',
        unsafeUpdate: '2.0.0',
      });
      npmMock.verify();
    });
  });
});
