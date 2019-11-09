describe('check-environment module test suite', () => {
  let checkEnvironment;
  beforeEach(() => {
    checkEnvironment = require('../check-environment');
  });
  describe('checkEnvironment', () => {
    test('OS is windows, should throw Error', () => {
      // Given
      Object.defineProperty(process, 'platform', {value: 'win32'});
      process.platform = 'win32';
      // When - Then
      expect(checkEnvironment).toThrow(
        'Unsupported OS, action only works in Linux'
      );
    });
    test('OS is Linux, should not throw Error', () => {
      // Given
      Object.defineProperty(process, 'platform', {value: 'linux'});
      // When - Then
      expect(checkEnvironment).not.toThrow();
    });
  });
});
