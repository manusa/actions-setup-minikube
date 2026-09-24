'use strict';

const fs = require('node:fs');

const originalExistsSync = fs.existsSync.bind(fs);
const originalReadFileSync = fs.readFileSync.bind(fs);

const givenOsRelease = (content, {exists = true} = {}) => {
  Object.defineProperty(process, 'platform', {value: 'linux'});
  jest.spyOn(fs, 'existsSync').mockImplementation(p => {
    if (p === '/etc/os-release') return exists;
    return originalExistsSync(p);
  });
  jest.spyOn(fs, 'readFileSync').mockImplementation((p, options, ...args) => {
    if (p === '/etc/os-release') {
      // Mirror real fs: a Buffer unless an encoding is requested
      const encoding =
        typeof options === 'string' ? options : options?.encoding;
      return encoding ? content : Buffer.from(content);
    }
    return originalReadFileSync(p, options, ...args);
  });
};

const unsupportedOsError = detected =>
  new Error(
    `Unsupported OS, action only works in Ubuntu 18.04 or later (detected: ${detected})`
  );

const ubuntuOsRelease = versionId =>
  [
    `PRETTY_NAME="Ubuntu ${versionId}"`,
    'NAME="Ubuntu"',
    `VERSION_ID="${versionId}"`,
    `VERSION="${versionId}"`,
    'ID=ubuntu',
    'ID_LIKE=debian'
  ].join('\n');

describe('checkEnvironment', () => {
  let checkEnvironment;
  let originalPlatform;
  let originalArch;

  beforeEach(() => {
    jest.resetModules();
    originalPlatform = process.platform;
    originalArch = process.arch;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {value: originalPlatform});
    Object.defineProperty(process, 'arch', {value: originalArch});
    jest.restoreAllMocks();
  });

  describe('on non-Linux platform', () => {
    beforeEach(() => {
      givenOsRelease(ubuntuOsRelease('24.04'));
      Object.defineProperty(process, 'platform', {value: 'win32'});
      checkEnvironment = require('../check-environment');
    });

    test('throws unsupported OS error with detected platform', () => {
      expect(checkEnvironment).toThrow(unsupportedOsError('win32'));
    });
  });

  describe('on Linux without /etc/os-release', () => {
    beforeEach(() => {
      givenOsRelease(ubuntuOsRelease('24.04'), {exists: false});
      checkEnvironment = require('../check-environment');
    });

    test('throws unsupported OS error with missing os-release', () => {
      expect(checkEnvironment).toThrow(
        unsupportedOsError('linux, no /etc/os-release')
      );
    });
  });

  describe('on Linux with non-Ubuntu os-release', () => {
    beforeEach(() => {
      givenOsRelease(
        ['NAME="Fedora Linux"', 'VERSION_ID=39', 'ID=fedora'].join('\n')
      );
      checkEnvironment = require('../check-environment');
    });

    test('throws unsupported OS error with detected distribution', () => {
      expect(checkEnvironment).toThrow(unsupportedOsError('fedora 39'));
    });
  });

  describe('on Ubuntu derivative os-release', () => {
    beforeEach(() => {
      givenOsRelease(
        [
          'NAME="Linux Mint"',
          'VERSION_ID="22.1"',
          'ID=linuxmint',
          'ID_LIKE="ubuntu debian"'
        ].join('\n')
      );
      checkEnvironment = require('../check-environment');
    });

    test('throws unsupported OS error with detected distribution', () => {
      expect(checkEnvironment).toThrow(unsupportedOsError('linuxmint 22.1'));
    });
  });

  describe('on Ubuntu os-release with single-quoted values', () => {
    beforeEach(() => {
      givenOsRelease(["ID='ubuntu'", "VERSION_ID='26.04'"].join('\n'));
      checkEnvironment = require('../check-environment');
    });

    test('does not throw', () => {
      expect(checkEnvironment).not.toThrow();
    });
  });

  describe('on Ubuntu os-release without VERSION_ID', () => {
    beforeEach(() => {
      givenOsRelease(['NAME="Ubuntu"', 'ID=ubuntu'].join('\n'));
      checkEnvironment = require('../check-environment');
    });

    test('throws unsupported OS error with unknown version', () => {
      expect(checkEnvironment).toThrow(unsupportedOsError('ubuntu unknown'));
    });
  });

  describe('on os-release with empty ID and VERSION_ID', () => {
    beforeEach(() => {
      givenOsRelease(['ID=', 'VERSION_ID=""'].join('\n'));
      checkEnvironment = require('../check-environment');
    });

    test('throws unsupported OS error with unknown distribution', () => {
      expect(checkEnvironment).toThrow(unsupportedOsError('unknown unknown'));
    });
  });

  describe('on Ubuntu older than 18.04', () => {
    beforeEach(() => {
      givenOsRelease(ubuntuOsRelease('17.10'));
      checkEnvironment = require('../check-environment');
    });

    test('throws unsupported OS error with detected version', () => {
      expect(checkEnvironment).toThrow(unsupportedOsError('ubuntu 17.10'));
    });
  });

  describe.each([
    '18.04',
    '20.04',
    '22.04',
    '24.04',
    '25.10',
    '26.04',
    '28.04'
  ])('on Ubuntu %s', versionId => {
    beforeEach(() => {
      givenOsRelease(ubuntuOsRelease(versionId));
      checkEnvironment = require('../check-environment');
    });

    test('does not throw', () => {
      expect(checkEnvironment).not.toThrow();
    });

    describe('on arm64 host', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'arch', {value: 'arm64'});
      });

      test('does not throw', () => {
        expect(checkEnvironment).not.toThrow();
      });
    });

    describe('on unsupported architecture', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'arch', {value: 'ppc64'});
      });

      test('throws unsupported architecture error', () => {
        expect(checkEnvironment).toThrow(/Unsupported architecture/);
      });
    });
  });
});
