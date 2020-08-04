describe('configure-docker module test suite', () => {
  let configureEnvironment;
  let logExecSync;
  beforeEach(() => {
    jest.resetModules();
    jest.mock('../exec');
    configureEnvironment = require('../configure-environment');
    logExecSync = require('../exec').logExecSync;
  });
  test('configureEnvironment, should run all configuration commands', () => {
    // Given
    logExecSync.mockImplementation(() => {});
    // When
    configureEnvironment();
    // Then
    expect(logExecSync).toHaveBeenCalledTimes(2);
  });
});
