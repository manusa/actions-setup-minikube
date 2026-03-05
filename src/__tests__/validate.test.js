'use strict';

describe('validate module test suite', () => {
  let core;
  let exec;
  let validate;
  beforeEach(() => {
    jest.resetModules();
    jest.mock('@actions/core');
    jest.mock('../exec');
    core = require('@actions/core');
    exec = require('../exec');
    validate = require('../validate');
  });
  describe('when kubernetes version is supported by minikube', () => {
    test('should not throw', () => {
      exec.execSync.mockReturnValue(
        Buffer.from('* v1.35.2\n* v1.34.3\n* v1.33.7\n')
      );
      expect(() =>
        validate('/minikube-dir', {kubernetesVersion: 'v1.35.2'})
      ).not.toThrow();
    });
    test('should log confirmation', () => {
      exec.execSync.mockReturnValue(Buffer.from('* v1.35.2\n* v1.34.3\n'));
      validate('/minikube-dir', {kubernetesVersion: 'v1.35.2'});
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('v1.35.2')
      );
    });
  });
  describe('when kubernetes version is not supported by minikube', () => {
    test('should throw an error', () => {
      exec.execSync.mockReturnValue(
        Buffer.from('* v1.35.2\n* v1.34.3\n* v1.33.7\n')
      );
      expect(() =>
        validate('/minikube-dir', {kubernetesVersion: 'v1.99.0'})
      ).toThrow(/v1\.99\.0/);
    });
  });
});
