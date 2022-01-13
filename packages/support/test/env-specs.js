// @ts-check

import {rewiremock} from './helpers';
import sinon from 'sinon';
import path from 'path';

const {expect} = chai;

describe('env', function () {
  /** @type {typeof import('../lib/env')} */
  let env;
  let sandbox;
  /**
   * @type { {'read-pkg': SinonStub<any[],Promise<any>>, 'resolve-from': SinonStub<any[],string>} }
   */
  let mocks;
  /** @type {string|undefined} */
  let envAppiumHome;

  beforeEach(function () {
    sandbox = sinon.createSandbox();

    // ensure an APPIUM_HOME in the environment does not befoul our tests
    envAppiumHome = process.env.APPIUM_HOME;
    delete process.env.APPIUM_HOME;

    mocks = {
      'read-pkg': sandbox.stub().resolves(),
      'resolve-from': sandbox.stub().returns('/some/path/to/manifest.json')
    };
    env = rewiremock.proxy(() => require('../lib/env'), mocks);
  });


  describe('getManifestPath()', function () {
    describe('when appium is located relative to cwd', function () {
      it('should return a path relative to cwd', async function () {
        expect(await env.getManifestPath()).to.equal(path.join(process.cwd(), env.LOCAL_RELATIVE_MANIFEST_PATH));
      });
    });

    describe('when appium is not located relative to cwd', function () {
      beforeEach(function () {
        mocks['resolve-from'].throws();
      });

      it('should return a path relative to the default APPIUM_HOME', async function () {
        expect(await env.getManifestPath()).to.equal(path.join(process.cwd(), env.MANIFEST_BASENAME));
      });
    });
  });

  afterEach(function () {
    sandbox.restore();
    process.env.APPIUM_HOME = envAppiumHome;
  });
});

/**
 * @template P,R
 * @typedef {import('sinon').SinonStub<P,R>} SinonStub<P,R>
 */
