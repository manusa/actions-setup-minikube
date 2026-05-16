'use strict';

describe('arch module', () => {
  let arch;
  let originalArch;

  beforeEach(() => {
    jest.resetModules();
    originalArch = process.arch;
  });

  afterEach(() => {
    Object.defineProperty(process, 'arch', {value: originalArch});
  });

  describe('on x64 host', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'arch', {value: 'x64'});
      ({arch} = require('../arch'));
    });

    test('returns amd64', () => {
      expect(arch()).toBe('amd64');
    });
  });

  describe('on arm64 host', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'arch', {value: 'arm64'});
      ({arch} = require('../arch'));
    });

    test('returns arm64', () => {
      expect(arch()).toBe('arm64');
    });
  });

  describe.each(['ia32', 'arm', 'ppc64', 's390x'])(
    'on unsupported %s host',
    unsupported => {
      beforeEach(() => {
        Object.defineProperty(process, 'arch', {value: unsupported});
        ({arch} = require('../arch'));
      });

      test('throws unsupported architecture error', () => {
        expect(arch).toThrow(/Unsupported architecture/);
      });
    }
  );
});
