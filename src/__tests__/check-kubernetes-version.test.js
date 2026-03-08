'use strict';

describe('check-kubernetes-version module test suite', () => {
  let core;
  let exec;
  let github;
  let checkKubernetesVersion;
  beforeEach(() => {
    jest.resetModules();
    jest.mock('@actions/core');
    jest.mock('../exec');
    jest.mock('../github');
    core = require('@actions/core');
    exec = require('../exec');
    github = require('../github');
    checkKubernetesVersion =
      require('../check-kubernetes-version').checkKubernetesVersion;
  });
  describe('when kubernetes version is supported by minikube', () => {
    beforeEach(() => {
      exec.execSync.mockReturnValue(
        Buffer.from('* v1.35.2\n* v1.34.3\n* v1.33.7\n')
      );
    });
    test('should not throw', async () => {
      await expect(
        checkKubernetesVersion('/minikube-dir', {
          kubernetesVersion: 'v1.35.2'
        })
      ).resolves.not.toThrow();
    });
    test('should return SUPPORTED', async () => {
      const result = await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.35.2'
      });
      expect(result).toBe('supported');
    });
    test('should log confirmation', async () => {
      await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.35.2'
      });
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('v1.35.2')
      );
    });
    test('should not call GitHub API', async () => {
      await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.35.2'
      });
      expect(github.gitHubRequest).not.toHaveBeenCalled();
    });
  });
  describe('when kubernetes version is not supported by minikube', () => {
    beforeEach(() => {
      exec.execSync.mockReturnValue(
        Buffer.from('* v1.35.2\n* v1.34.3\n* v1.33.7\n')
      );
    });
    describe('and exists on GitHub', () => {
      beforeEach(() => {
        github.gitHubRequest.mockResolvedValue({status: 200});
      });
      test('should return UNSUPPORTED', async () => {
        const result = await checkKubernetesVersion('/minikube-dir', {
          kubernetesVersion: 'v1.99.0',
          githubToken: 'test-token'
        });
        expect(result).toBe('unsupported');
      });
      test('should warn about unsupported version', async () => {
        await checkKubernetesVersion('/minikube-dir', {
          kubernetesVersion: 'v1.99.0',
          githubToken: 'test-token'
        });
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining('not in Minikube')
        );
      });
      test('should pass github token to API call', async () => {
        await checkKubernetesVersion('/minikube-dir', {
          kubernetesVersion: 'v1.99.0',
          githubToken: 'test-token'
        });
        expect(github.gitHubRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            githubToken: 'test-token'
          })
        );
      });
    });
    describe('and does not exist on GitHub', () => {
      beforeEach(() => {
        github.gitHubRequest.mockResolvedValue({status: 404});
      });
      test('should throw an error', async () => {
        await expect(
          checkKubernetesVersion('/minikube-dir', {
            kubernetesVersion: 'v1.99.0'
          })
        ).rejects.toThrow(/v1\.99\.0/);
      });
      test('should include supported versions in error', async () => {
        await expect(
          checkKubernetesVersion('/minikube-dir', {
            kubernetesVersion: 'v1.99.0'
          })
        ).rejects.toThrow(/v1\.35\.2/);
      });
    });
  });
  describe('when version is a partial match', () => {
    beforeEach(() => {
      exec.execSync.mockReturnValue(
        Buffer.from('* v1.35.2\n* v1.34.3\n* v1.33.7\n')
      );
      github.gitHubRequest.mockResolvedValue({status: 200});
    });
    test('should not match v1.3 against v1.35.2', async () => {
      const result = await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.3'
      });
      expect(result).toBe('unsupported');
    });
  });
});
