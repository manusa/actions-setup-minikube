describe('check-environment module test suite', () => {
  let checkEnvironment;
  let fs;
  beforeEach(() => {
    jest.resetModules();
    jest.mock('fs');
    checkEnvironment = require('../check-environment');
    fs = require('fs');
  });
  describe('checkEnvironment', () => {
    test('OS is Linux but not Ubuntu, should throw Error', () => {
      // Given
      Object.defineProperty(process, 'platform', {value: 'linux'});
      fs.existsSync.mockImplementationOnce(() => false);
      fs.readFileSync.mockImplementationOnce(() => 'SOME DIFFERENT OS');
      // When - Then
      expect(checkEnvironment).toThrow(
        'Unsupported OS, action only works in Ubuntu 18'
      );
      expect(fs.existsSync).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync).toHaveBeenCalledTimes(0);
    });
    test('OS is Linux but not Ubuntu 18, should throw Error', () => {
      // Given
      Object.defineProperty(process, 'platform', {value: 'linux'});
      fs.existsSync.mockImplementationOnce(() => true);
      fs.readFileSync.mockImplementationOnce(() => 'SOME DIFFERENT OS');
      // When - Then
      expect(checkEnvironment).toThrow(
        'Unsupported OS, action only works in Ubuntu 18'
      );
      expect(fs.existsSync).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });
    test('OS is Linux, should not throw Error', () => {
      // Given
      Object.defineProperty(process, 'platform', {value: 'linux'});
      fs.existsSync.mockImplementationOnce(() => true);
      fs.readFileSync.mockImplementationOnce(
        () => `
        NAME="Ubuntu"
        VERSION="18.04.3 LTS (Bionic Beaver)"
        `
      );
      // When - Then
      expect(checkEnvironment).not.toThrow();
    });
    test('OS is windows, should not throw Error', () => {
      // Given
      Object.defineProperty(process, 'platform', {value: 'win32'});
      process.platform = 'win32';
      // When - Then
      expect(checkEnvironment).not.toThrow();
    });
  });
});
