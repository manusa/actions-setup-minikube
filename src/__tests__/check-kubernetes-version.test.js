'use strict';

const {createHttpTestServer} = require('./test-utils/http-test-server');

jest.mock('../exec');

describe('checkKubernetesVersion', () => {
  let testServer;
  let baseUrl;
  let exec;
  let checkKubernetesVersion;

  beforeAll(async () => {
    testServer = createHttpTestServer();
    const port = await testServer.start();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await testServer.stop();
  });

  beforeEach(() => {
    jest.resetModules();
    process.env.GITHUB_API_URL = baseUrl;

    exec = require('../exec');
    checkKubernetesVersion =
      require('../check-kubernetes-version').checkKubernetesVersion;
    exec.execSync.mockReturnValue(
      Buffer.from('* v1.35.2\n* v1.34.3\n* v1.33.7\n')
    );

    testServer.clearRoutes();
    testServer.clearRequests();
  });

  afterEach(() => {
    delete process.env.GITHUB_API_URL;
  });

  describe('with a minikube directory containing spaces', () => {
    test('quotes the binary path when listing supported versions', async () => {
      await checkKubernetesVersion('/tmp/runner dir', {
        kubernetesVersion: 'v1.35.2'
      });
      expect(exec.execSync).toHaveBeenCalledWith(
        "'/tmp/runner dir/minikube' config defaults kubernetes-version"
      );
    });
  });

  describe('when version is in minikube supported list', () => {
    test('returns SUPPORTED', async () => {
      const result = await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.35.2'
      });
      expect(result).toBe('supported');
    });

    test('does not call GitHub API', async () => {
      await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.35.2'
      });
      expect(testServer.getRequests()).toHaveLength(0);
    });
  });

  describe('when version is not in supported list but exists on GitHub', () => {
    beforeEach(() => {
      testServer.get('/repos/kubernetes/kubernetes/releases/tags/*', () => ({
        status: 200,
        body: {tag_name: 'v1.99.0'}
      }));
    });

    test('returns UNSUPPORTED', async () => {
      const result = await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.99.0'
      });
      expect(result).toBe('unsupported');
    });

    test('forwards github token to API call', async () => {
      await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.99.0',
        githubToken: 'test-token'
      });
      const apiRequest = testServer
        .getRequests()
        .find(r => r.pathname.includes('/releases/tags/'));
      expect(apiRequest.headers.authorization).toBe('token test-token');
    });
  });

  describe('when version is not in supported list and not on GitHub', () => {
    beforeEach(() => {
      testServer.get('/repos/kubernetes/kubernetes/releases/tags/*', () => ({
        status: 404,
        body: {message: 'Not Found'}
      }));
    });

    test('throws with the requested version', async () => {
      await expect(
        checkKubernetesVersion('/minikube-dir', {
          kubernetesVersion: 'v1.99.0'
        })
      ).rejects.toThrow(/v1\.99\.0/);
    });

    test('includes supported versions in error', async () => {
      await expect(
        checkKubernetesVersion('/minikube-dir', {
          kubernetesVersion: 'v1.99.0'
        })
      ).rejects.toThrow(/v1\.35\.2/);
    });
  });

  describe('partial version matching', () => {
    beforeEach(() => {
      testServer.get('/repos/kubernetes/kubernetes/releases/tags/*', () => ({
        status: 200,
        body: {tag_name: 'v1.3'}
      }));
    });

    test('v1.3 does not match v1.35.2', async () => {
      const result = await checkKubernetesVersion('/minikube-dir', {
        kubernetesVersion: 'v1.3'
      });
      expect(result).toBe('unsupported');
    });
  });
});
