describe('configure-docker module test suite', () => {
  let configureEnvironment;
  let execSync;
  beforeEach(() => {
    jest.resetModules();
    jest.mock('../exec-sync');
    configureEnvironment = require('../configure-environment');
    execSync = require('../exec-sync');
  });
  test('configureEnvironment, should run all configuration commands', () => {
    // Given
    execSync.mockImplementation(() => {});
    // When
    configureEnvironment();
    // Then
    expect(execSync).toHaveBeenCalledTimes(6);
  });
});
