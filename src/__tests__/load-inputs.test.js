'use strict';

const loadInputs = require('../load-inputs');

describe('loadInputs', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('with only required variables', () => {
    let result;

    beforeEach(() => {
      process.env = {
        INPUT_MINIKUBE_VERSION: 'v1.33.7',
        INPUT_KUBERNETES_VERSION: 'v1.3.37'
      };
      result = loadInputs();
    });

    test('returns minikube version', () => {
      expect(result.minikubeVersion).toBe('v1.33.7');
    });

    test('returns kubernetes version', () => {
      expect(result.kubernetesVersion).toBe('v1.3.37');
    });

    test('returns empty string for optional inputs', () => {
      expect(result.githubToken).toBe('');
      expect(result.driver).toBe('');
      expect(result.containerRuntime).toBe('');
      expect(result.startArgs).toBe('');
    });
  });

  describe('with all variables', () => {
    let result;

    beforeEach(() => {
      process.env = {
        INPUT_MINIKUBE_VERSION: 'v1.33.7',
        INPUT_KUBERNETES_VERSION: 'v1.3.37',
        INPUT_GITHUB_TOKEN: 'secret-token',
        INPUT_DRIVER: 'minikube-driver',
        INPUT_CONTAINER_RUNTIME: 'cri-o',
        INPUT_START_ARGS: '--mount=Aitana --character=Alex'
      };
      result = loadInputs();
    });

    test('returns github token', () => {
      expect(result.githubToken).toBe('secret-token');
    });

    test('returns driver', () => {
      expect(result.driver).toBe('minikube-driver');
    });

    test('returns container runtime', () => {
      expect(result.containerRuntime).toBe('cri-o');
    });

    test('returns start args', () => {
      expect(result.startArgs).toBe('--mount=Aitana --character=Alex');
    });
  });

  describe('with versions without v prefix', () => {
    let result;

    beforeEach(() => {
      process.env = {
        INPUT_MINIKUBE_VERSION: '1.33.7',
        INPUT_KUBERNETES_VERSION: '1.33.1'
      };
      result = loadInputs();
    });

    test('adds v prefix to kubernetes version', () => {
      expect(result.kubernetesVersion).toBe('v1.33.1');
    });

    test('adds v prefix to minikube version', () => {
      expect(result.minikubeVersion).toBe('v1.33.7');
    });
  });

  describe('with missing required variables', () => {
    test('throws error for missing minikube version', () => {
      expect(loadInputs).toThrow(
        'Input required and not supplied: minikube version'
      );
    });
  });
});
