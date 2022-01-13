// @ts-check

import { promises as fs } from 'fs';
import path from 'path';
import sinon from 'sinon';
import YAML from 'yaml';
import { rewiremock } from './helpers';
const expect = chai.expect;

describe('ManifestIO', function () {
  const manifestPath = path.join(__dirname, 'fixtures', 'extensions.yaml');

  /**
   * @type {import('sinon').SinonSandbox}
   */
  let sandbox;

  /** @type {string} */
  let yamlFixture;

  before(async function () {
    yamlFixture = await fs.readFile(manifestPath, 'utf8');
  });

  /**
   * @type {typeof import('../lib/manifest-io').getManifestIOInstance}
   */
  let getManifestIOInstance;

  let mocks;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mocks = {
      '@appium/support': {
        fs: {
          readFile: sandbox.stub().resolves(yamlFixture),
          writeFile: sandbox.stub().resolves(true),
        },
        mkdirp: sandbox.stub().resolves(),
        env: {
          getManifestPath: sandbox.stub().resolves(manifestPath)
        },
        logger: {
          getLogger: sandbox.stub().returns(console)
        }
      },
    };
    getManifestIOInstance = rewiremock.proxy(
      '../lib/manifest-io',
      mocks,
    ).getManifestIOInstance;
  });

  afterEach(function () {
    sandbox.restore();
    getManifestIOInstance.cache = new Map();
  });

  describe('instantiation', function () {
    describe('when called twice with the same `appiumHome` value', function () {
      it('should return the same object both times', function () {
        const firstInstance = getManifestIOInstance('/some/path');
        const secondInstance = getManifestIOInstance('/some/path');
        expect(firstInstance).to.equal(secondInstance);
      });
    });

    describe('when called twice with different `appiumHome` values', function () {
      it('should return different objects', function () {
        const firstInstance = getManifestIOInstance('/some/path');
        const secondInstance = getManifestIOInstance('/some/other/path');
        expect(firstInstance).to.not.equal(secondInstance);
      });
    });
  });

  describe('property', function () {
    describe('filepath', function () {
      it('should not be writable', function () {
        const instance = getManifestIOInstance('/some/path');
        expect(() => {
          // @ts-ignore
          instance.appiumHome = '/some/other/path';
        }).to.throw(TypeError);
      });
    });
  });

  describe('read()', function () {
    /** @type {import('../lib/manifest-io').ManifestIO} */
    let io;

    beforeEach(function () {
      getManifestIOInstance.cache = new Map();
      io = getManifestIOInstance('/some/path');
    });

    describe('when the file does not yet exist', function () {
      beforeEach(async function () {
        /** @type {NodeJS.ErrnoException} */
        const err = new Error();
        err.code = 'ENOENT';
        mocks['@appium/support'].fs.readFile.rejects(err);
        await io.read();
      });

      it('should create a new file', function () {
        expect(mocks['@appium/support'].fs.writeFile).to.be.calledWith(
          io.manifestPath,
          YAML.stringify({drivers: {}, plugins: {}, schemaRev: 2}),
          'utf8',
        );
      });

      describe('when the file already exists', function () {
        beforeEach(async function () {
          await io.read();
        });

        it('should attempt to create the parent directory for the manifest file', function () {
          expect(mocks['@appium/support'].mkdirp).to.have.been.calledOnceWith(
            path.dirname(manifestPath)
          );
        });

        it('should attempt to read the file at `filepath`', function () {
          expect(
            mocks['@appium/support'].fs.readFile,
          ).to.have.been.calledOnceWith(manifestPath, 'utf8');
        });
      });
    });
  });

  describe('write()', function () {
    /** @type {import('../lib/manifest-io').ManifestIO} */
    let io;
    /** @type {import('../lib/extension-config').Manifest} */
    let manifest;

    beforeEach(function () {
      io = getManifestIOInstance('/some/path');
    });

    describe('when called after `read()`', function () {
      beforeEach(async function () {
        manifest = await io.read();
      });

      describe('when called without modifying the data', function () {
        it('should not write the file', async function () {
          expect(await io.write()).to.be.false;
        });
      });

      describe('when called after adding a property', function () {
        beforeEach(function () {
          manifest.drivers.foo = {
            version: '1.0.0',
            automationName: 'Derp',
            installPath: '/some/path/to/foo',
            mainClass: 'SomeClass',
            pkgName: 'derp',
            platformNames: ['dogs', 'cats']
          };
        });

        it('should write the file', async function () {
          expect(await io.write()).to.be.true;
        });
      });

      describe('when called after deleting a property', function () {
        beforeEach(async function () {
          manifest.drivers.foo = {
            version: '1.0.0',
            automationName: 'Derp',
            installPath: '/some/path/to/foo',
            mainClass: 'SomeClass',
            pkgName: 'derp',
            platformNames: ['dogs', 'cats']
          };
          await io.write();
          delete manifest.drivers.foo;
        });

        it('should write the file', async function () {
          expect(await io.write()).to.be.true;
        });
      });

      describe('when the manifest file could not be written', function () {
        beforeEach(function () {
          mocks['@appium/support'].fs.writeFile = sandbox
            .stub()
            .rejects(new Error());
          manifest.drivers.foo = {
            version: '1.0.0',
            automationName: 'Derp',
            installPath: '/some/path/to/foo',
            mainClass: 'SomeClass',
            pkgName: 'derp',
            platformNames: ['dogs', 'cats']
          };
        });

        it('should reject', async function () {
          await expect(io.write()).to.be.rejectedWith(
            Error,
            /Appium could not write to manifest/i,
          );
        });
      });
    });

    describe('when called before `read()`', function () {
      it('should return `false`', async function () {
        expect(await io.write()).to.be.false;
      });

      describe('when called with `force: true`', function () {
        it('should reject', async function () {
          await expect(io.write(true)).to.be.rejectedWith(
            ReferenceError,
            'No data to write. Call `read()` first',
          );
        });
      });
    });
  });
});
