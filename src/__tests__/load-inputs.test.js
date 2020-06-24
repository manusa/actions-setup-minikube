describe('load-inputs module test suite', () => {
  let loadInputs;
  beforeEach(() => {
    loadInputs = require('../load-inputs');
    process.env = {};
  });
  describe('loadInputs', () => {
    test('Required variables in env, should return valid inputs', () => {
      // Given
      process.env = {
        INPUT_MINIKUBE_VERSION: 'v1.33.7',
        INPUT_KUBERNETES_VERSION: 'v1.3.37'
      };
      // When
      const result = loadInputs();
      // Then
      expect(result).toEqual({
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.3.37',
        githubToken: '',
        driver: ''
      });
    });
    test('All variables in env, should return valid inputs', () => {
      // Given
      process.env = {
        INPUT_MINIKUBE_VERSION: 'v1.33.7',
        INPUT_KUBERNETES_VERSION: 'v1.3.37',
        INPUT_GITHUB_TOKEN: 'secret-token',
        INPUT_DRIVER: 'minikube-driver'
      };
      // When
      const result = loadInputs();
      // Then
      expect(result).toEqual({
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.3.37',
        githubToken: 'secret-token',
        driver: 'minikube-driver'
      });
    });
    test('Required variables NOT in env, should throw error', () => {
      // Given
      process.env = {};
      // When - Then
      expect(loadInputs).toThrow(
        'Input required and not supplied: minikube version'
      );
    });
    test('Empty env, should throw error', () => {
      // Given
      process.env = {};
      // When - Then
      expect(loadInputs).toThrow(
        'Input required and not supplied: minikube version'
      );
    });
  });
});
