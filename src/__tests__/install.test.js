describe('install module test suite', () => {
  let core;
  let io;
  let path;
  let exec;
  let checkKubernetesVersion;
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
    jest.mock('../check-kubernetes-version', () => ({
      checkKubernetesVersion: jest.fn().mockResolvedValue('supported'),
      SUPPORTED: 'supported',
      UNSUPPORTED: 'unsupported'
    }));
    core = require('@actions/core');
    io = require('@actions/io');
    path = require('path');
    exec = require('../exec');
    checkKubernetesVersion =
      require('../check-kubernetes-version').checkKubernetesVersion;
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
  test('install, should check kubernetes version', async () => {
    // Given
    const inputs = {minikubeVersion: 'v1.33.7', kubernetesVersion: 'v1.33.7'};
    exec.logExecSync.mockImplementation();
    exec.execSync.mockImplementation(() => '');
    // When
    await install('minikubeFileLocation', inputs);
    // Then
    expect(checkKubernetesVersion).toHaveBeenCalled();
  });
  test('install, should check kubernetes version before starting cluster', async () => {
    // Given
    const inputs = {minikubeVersion: 'v1.33.7', kubernetesVersion: 'v1.33.7'};
    const callOrder = [];
    checkKubernetesVersion.mockImplementation(async () => {
      callOrder.push('checkKubernetesVersion');
      return 'supported';
    });
    exec.logExecSync.mockImplementation(cmd => {
      if (cmd.includes('minikube start')) callOrder.push('start');
    });
    exec.execSync.mockImplementation(() => '');
    // When
    await install('minikubeFileLocation', inputs);
    // Then
    expect(callOrder.indexOf('checkKubernetesVersion')).toBeLessThan(
      callOrder.indexOf('start')
    );
  });
  test('install, should add --force for unsupported kubernetes version', async () => {
    // Given
    const inputs = {
      minikubeVersion: 'v1.33.7',
      kubernetesVersion: 'v1.99.0',
      startArgs: ''
    };
    checkKubernetesVersion.mockResolvedValue('unsupported');
    exec.logExecSync.mockImplementation();
    exec.execSync.mockImplementation(() => '');
    // When
    await install('minikubeFileLocation', inputs);
    // Then
    const startCall = exec.logExecSync.mock.calls.find(call =>
      call[0].includes('minikube start')
    );
    expect(startCall[0]).toContain('--force');
  });
  test('install, should warn when adding --force for unsupported kubernetes version', async () => {
    // Given
    const inputs = {
      minikubeVersion: 'v1.33.7',
      kubernetesVersion: 'v1.99.0',
      startArgs: ''
    };
    checkKubernetesVersion.mockResolvedValue('unsupported');
    exec.logExecSync.mockImplementation();
    exec.execSync.mockImplementation(() => '');
    // When
    await install('minikubeFileLocation', inputs);
    // Then
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('--force')
    );
  });
  test('install, should set force output for unsupported kubernetes version', async () => {
    // Given
    const inputs = {
      minikubeVersion: 'v1.33.7',
      kubernetesVersion: 'v1.99.0',
      startArgs: ''
    };
    checkKubernetesVersion.mockResolvedValue('unsupported');
    exec.logExecSync.mockImplementation();
    exec.execSync.mockImplementation(() => '');
    // When
    await install('minikubeFileLocation', inputs);
    // Then
    expect(core.setOutput).toHaveBeenCalledWith('force', 'true');
  });
  test('install, should not set force output for supported kubernetes version', async () => {
    // Given
    const inputs = {
      minikubeVersion: 'v1.33.7',
      kubernetesVersion: 'v1.33.7',
      startArgs: ''
    };
    exec.logExecSync.mockImplementation();
    exec.execSync.mockImplementation(() => '');
    // When
    await install('minikubeFileLocation', inputs);
    // Then
    expect(core.setOutput).not.toHaveBeenCalledWith('force', 'true');
  });
  test('install, should not add --force for supported kubernetes version', async () => {
    // Given
    const inputs = {
      minikubeVersion: 'v1.33.7',
      kubernetesVersion: 'v1.33.7',
      startArgs: ''
    };
    exec.logExecSync.mockImplementation();
    exec.execSync.mockImplementation(() => '');
    // When
    await install('minikubeFileLocation', inputs);
    // Then
    const startCall = exec.logExecSync.mock.calls.find(call =>
      call[0].includes('minikube start')
    );
    expect(startCall[0]).not.toContain('--force');
  });
});
