'use strict';

const fs = require('node:fs');

const originalExistsSync = fs.existsSync.bind(fs);
const originalReadFileSync = fs.readFileSync.bind(fs);

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
      Object.defineProperty(process, 'platform', {value: 'win32'});
      checkEnvironment = require('../check-environment');
    });

    test('throws unsupported OS error', () => {
      expect(checkEnvironment).toThrow(/Unsupported OS/);
    });
  });

  describe('on Linux without /etc/os-release', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {value: 'linux'});
      jest.spyOn(fs, 'existsSync').mockImplementation(p => {
        if (p === '/etc/os-release') return false;
        return originalExistsSync(p);
      });
      checkEnvironment = require('../check-environment');
    });

    test('throws unsupported OS error', () => {
      expect(checkEnvironment).toThrow(/Unsupported OS/);
    });
  });

  describe('on Linux with non-Ubuntu os-release', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {value: 'linux'});
      jest.spyOn(fs, 'existsSync').mockImplementation(p => {
        if (p === '/etc/os-release') return true;
        return originalExistsSync(p);
      });
      jest.spyOn(fs, 'readFileSync').mockImplementation((p, ...args) => {
        if (p === '/etc/os-release') return 'NAME="Fedora"\nVERSION="39"';
        return originalReadFileSync(p, ...args);
      });
      checkEnvironment = require('../check-environment');
    });

    test('throws unsupported OS error', () => {
      expect(checkEnvironment).toThrow(/Unsupported OS/);
    });
  });

  describe.each(['18', '20', '22', '24'])('on Ubuntu %s', version => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {value: 'linux'});
      jest.spyOn(fs, 'existsSync').mockImplementation(p => {
        if (p === '/etc/os-release') return true;
        return originalExistsSync(p);
      });
      jest.spyOn(fs, 'readFileSync').mockImplementation((p, ...args) => {
        if (p === '/etc/os-release') {
          return `NAME="Ubuntu"\nVERSION="${version}.04.1 LTS"`;
        }
        return originalReadFileSync(p, ...args);
      });
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
