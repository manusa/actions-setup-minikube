describe('install module test suite', () => {
  let core;
  let io;
  let path;
  let exec;
  let validate;
  let install;
  beforeEach(() => {
    jest.resetModules();
    jest.mock('@actions/core');
    jest.mock('@actions/io', () => ({
      mkdirP: jest.fn(() => {}),
      mv: jest.fn(() => {})
    }));
    jest.mock('path');
    jest.mock('../exec');
    jest.mock('../validate');
    core = require('@actions/core');
    io = require('@actions/io');
    path = require('path');
    exec = require('../exec');
    validate = require('../validate');
    install = require('../install');
  });
  test('install, should perform necessary steps', async () => {
    // Given
    const inputs = {minikubeVersion: 'v1.33.7'};
    exec.logExecSync.mockImplementation();
    exec.execSync.mockImplementation(() => '');
    // When
    await install('minikubeFileLocation', inputs);
    // Then
    expect(exec.logExecSync).toHaveBeenCalledTimes(5);
    expect(exec.execSync).toHaveBeenCalledTimes(1);
  });
  test('install, should validate kubernetes version', async () => {
    // Given
    const inputs = {minikubeVersion: 'v1.33.7', kubernetesVersion: 'v1.33.7'};
    exec.logExecSync.mockImplementation();
    exec.execSync.mockImplementation(() => '');
    // When
    await install('minikubeFileLocation', inputs);
    // Then
    expect(validate).toHaveBeenCalled();
  });
  test('install, should validate kubernetes version before starting cluster', async () => {
    // Given
    const inputs = {minikubeVersion: 'v1.33.7', kubernetesVersion: 'v1.33.7'};
    const callOrder = [];
    validate.mockImplementation(() => callOrder.push('validate'));
    exec.logExecSync.mockImplementation(cmd => {
      if (cmd.includes('minikube start')) callOrder.push('start');
    });
    exec.execSync.mockImplementation(() => '');
    // When
    await install('minikubeFileLocation', inputs);
    // Then
    expect(callOrder.indexOf('validate')).toBeLessThan(
      callOrder.indexOf('start')
    );
  });
});
