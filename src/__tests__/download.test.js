'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHttpTestServer} = require('./test-utils/http-test-server');
const {createTarball} = require('./test-utils/create-tarball');

// Only mock system commands that require root/sudo
jest.mock('../exec');

const SERVICE_FILE_CONTENT =
  'ExecStart=/usr/bin/cri-dockerd --container-runtime-endpoint fd://';
const SOCKET_FILE_CONTENT = 'ListenStream=/var/run/cri-docker.sock';

describe('download module', () => {
  let testServer;
  let baseUrl;
  let download;
  let tc;
  let exec;
  let tmpDir;
  let originalArch;

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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'download-test-'));
    process.env.RUNNER_TEMP = tmpDir;
    process.env.GITHUB_API_URL = baseUrl;
    process.env.GITHUB_SERVER_URL = baseUrl;
    originalArch = process.arch;

    exec = require('../exec');
    download = require('../download');
    tc = require('@actions/tool-cache');

    testServer.clearRoutes();
    testServer.clearRequests();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
    delete process.env.RUNNER_TEMP;
    delete process.env.GITHUB_API_URL;
    delete process.env.GITHUB_SERVER_URL;
    Object.defineProperty(process, 'arch', {value: originalArch});
  });

  describe('downloadMinikube', () => {
    beforeEach(() => {
      testServer.get('/repos/kubernetes/minikube/releases/tags/v1.33.7', {
        assets: [
          {
            name: 'minikube-windows-amd64.exe',
            browser_download_url: `${baseUrl}/download/minikube-windows`
          },
          {
            name: 'minikube-linux-amd64',
            browser_download_url: `${baseUrl}/download/minikube-linux-amd64`
          },
          {
            name: 'minikube-linux-amd64.sha256',
            browser_download_url: `${baseUrl}/download/minikube-sha256`
          },
          {
            name: 'minikube-linux-arm64',
            browser_download_url: `${baseUrl}/download/minikube-linux-arm64`
          },
          {
            name: 'minikube-linux-arm64.sha256',
            browser_download_url: `${baseUrl}/download/minikube-sha256`
          }
        ]
      });
      testServer.get('/download/minikube-linux-amd64', () => ({
        binary: Buffer.from('fake-minikube-binary')
      }));
      testServer.get('/download/minikube-linux-arm64', () => ({
        binary: Buffer.from('fake-minikube-binary-arm64')
      }));
    });

    test('downloads file to disk', async () => {
      const filePath = await download.downloadMinikube({
        minikubeVersion: 'v1.33.7'
      });
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('selects linux amd64 binary, not windows or checksum', async () => {
      await download.downloadMinikube({minikubeVersion: 'v1.33.7'});
      const downloadRequests = testServer
        .getRequests()
        .filter(r => r.pathname.startsWith('/download/'));
      expect(downloadRequests).toHaveLength(1);
      expect(downloadRequests[0].pathname).toBe(
        '/download/minikube-linux-amd64'
      );
    });

    test('queries the minikube release tag', async () => {
      await download.downloadMinikube({minikubeVersion: 'v1.33.7'});
      expect(testServer.getRequests()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pathname: '/repos/kubernetes/minikube/releases/tags/v1.33.7'
          })
        ])
      );
    });

    test('forwards github token', async () => {
      await download.downloadMinikube({
        minikubeVersion: 'v1.33.7',
        githubToken: 'secret-token'
      });
      const apiRequest = testServer
        .getRequests()
        .find(r => r.pathname.includes('/releases/tags/'));
      expect(apiRequest.headers.authorization).toBe('token secret-token');
    });

    describe('on arm64 host', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'arch', {value: 'arm64'});
      });

      test('selects linux arm64 binary, not amd64', async () => {
        await download.downloadMinikube({minikubeVersion: 'v1.33.7'});
        const downloadRequests = testServer
          .getRequests()
          .filter(r => r.pathname.startsWith('/download/'));
        expect(downloadRequests).toHaveLength(1);
        expect(downloadRequests[0].pathname).toBe(
          '/download/minikube-linux-arm64'
        );
      });
    });

    describe('on arm64 host with no arm64 asset published', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'arch', {value: 'arm64'});
        testServer.clearRoutes();
        testServer.get('/repos/kubernetes/minikube/releases/tags/v0.1.0', {
          assets: [
            {
              name: 'minikube-linux-amd64',
              browser_download_url: `${baseUrl}/download/minikube-linux-amd64`
            }
          ]
        });
      });

      test('throws an actionable error naming the arch', async () => {
        await expect(
          download.downloadMinikube({minikubeVersion: 'v0.1.0'})
        ).rejects.toThrow(/No matching arm64 asset/);
      });
    });
  });

  describe('installCniPlugins', () => {
    let cniTarball;

    beforeAll(() => {
      cniTarball = createTarball({
        bridge: 'cni-bridge',
        loopback: 'cni-loopback'
      });
    });

    beforeEach(() => {
      testServer.get(
        '/repos/containernetworking/plugins/releases/tags/v1.9.0',
        {
          assets: [
            {
              name: 'cni-plugins-linux-amd64-v1.9.0.tgz.sha1',
              browser_download_url: `${baseUrl}/invalid`
            },
            {
              name: 'cni-plugins-linux-amd64-v1.9.0.tgz',
              browser_download_url: `${baseUrl}/download/cni-plugins-amd64.tgz`
            },
            {
              name: 'cni-plugins-linux-amd64-v1.9.0.tgz.sha512',
              browser_download_url: `${baseUrl}/invalid`
            },
            {
              name: 'cni-plugins-windows-amd64-v1.9.0.tgz',
              browser_download_url: `${baseUrl}/invalid`
            },
            {
              name: 'cni-plugins-linux-arm64-v1.9.0.tgz',
              browser_download_url: `${baseUrl}/download/cni-plugins-arm64.tgz`
            },
            {
              name: 'cni-plugins-linux-arm64-v1.9.0.tgz.sha512',
              browser_download_url: `${baseUrl}/invalid`
            }
          ]
        }
      );
      testServer.get('/download/cni-plugins-amd64.tgz', () => ({
        binary: cniTarball
      }));
      testServer.get('/download/cni-plugins-arm64.tgz', () => ({
        binary: cniTarball
      }));
    });

    test('extracts plugin binaries from downloaded tarball', async () => {
      await download.installCniPlugins({});
      const installCmd = exec.logExecSync.mock.calls[0][0];
      const extractedDir = installCmd.match(/sudo find (\S+)/)[1];
      expect(fs.readdirSync(extractedDir)).toEqual(
        expect.arrayContaining(['bridge', 'loopback'])
      );
    });

    test('installs to /opt/cni/bin', async () => {
      await download.installCniPlugins({});
      expect(exec.logExecSync).toHaveBeenCalledWith(
        expect.stringMatching(/install -Dm 0755 .+\/opt\/cni\/bin/)
      );
    });

    test('requests the pinned release tag', async () => {
      await download.installCniPlugins({});
      expect(testServer.getRequests()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pathname: '/repos/containernetworking/plugins/releases/tags/v1.9.0'
          })
        ])
      );
    });

    test('forwards github token', async () => {
      await download.installCniPlugins({githubToken: 'secret-token'});
      const apiRequest = testServer
        .getRequests()
        .find(r => r.pathname.includes('/releases/tags/'));
      expect(apiRequest.headers.authorization).toBe('token secret-token');
    });

    test('selects linux amd64 tarball on x64 host', async () => {
      await download.installCniPlugins({});
      const downloadRequests = testServer
        .getRequests()
        .filter(r => r.pathname.startsWith('/download/'));
      expect(downloadRequests).toHaveLength(1);
      expect(downloadRequests[0].pathname).toBe(
        '/download/cni-plugins-amd64.tgz'
      );
    });

    describe('on arm64 host', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'arch', {value: 'arm64'});
      });

      test('selects linux arm64 tarball, not amd64', async () => {
        await download.installCniPlugins({});
        const downloadRequests = testServer
          .getRequests()
          .filter(r => r.pathname.startsWith('/download/'));
        expect(downloadRequests).toHaveLength(1);
        expect(downloadRequests[0].pathname).toBe(
          '/download/cni-plugins-arm64.tgz'
        );
      });
    });
  });

  describe('installCriCtl', () => {
    let crictlTarball;

    beforeAll(() => {
      crictlTarball = createTarball({crictl: 'crictl-binary'});
    });

    beforeEach(() => {
      testServer.get('/repos/kubernetes-sigs/cri-tools/releases/tags/v1.35.0', {
        assets: [
          {
            name: 'crictl-windows-amd64.exe',
            browser_download_url: `${baseUrl}/invalid`
          },
          {
            name: 'crictl-linux-amd64.tar.gz',
            browser_download_url: `${baseUrl}/download/crictl-amd64.tar.gz`
          },
          {
            name: 'crictl-linux-amd64.sha256',
            browser_download_url: `${baseUrl}/invalid`
          },
          {
            name: 'crictl-linux-arm64.tar.gz',
            browser_download_url: `${baseUrl}/download/crictl-arm64.tar.gz`
          },
          {
            name: 'crictl-linux-arm64.sha256',
            browser_download_url: `${baseUrl}/invalid`
          }
        ]
      });
      testServer.get('/download/crictl-amd64.tar.gz', () => ({
        binary: crictlTarball
      }));
      testServer.get('/download/crictl-arm64.tar.gz', () => ({
        binary: crictlTarball
      }));
      // extractTar destination is /usr/local/bin (not writable without sudo)
      jest.spyOn(tc, 'extractTar').mockImplementation(async tarPath => {
        if (!fs.existsSync(tarPath)) {
          throw new Error(`Tarball not found: ${tarPath}`);
        }
        return '/usr/local/bin';
      });
    });

    afterEach(() => {
      tc.extractTar.mockRestore();
    });

    test('downloads a real tarball to disk', async () => {
      await download.installCriCtl({});
      const tarPath = tc.extractTar.mock.calls[0][0];
      expect(fs.existsSync(tarPath)).toBe(true);
    });

    test('extracts to /usr/local/bin', async () => {
      await download.installCriCtl({});
      expect(tc.extractTar).toHaveBeenCalledWith(
        expect.any(String),
        '/usr/local/bin'
      );
    });

    test('requests the pinned release tag', async () => {
      await download.installCriCtl({});
      expect(testServer.getRequests()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pathname: '/repos/kubernetes-sigs/cri-tools/releases/tags/v1.35.0'
          })
        ])
      );
    });

    test('forwards github token', async () => {
      await download.installCriCtl({githubToken: 'secret-token'});
      const apiRequest = testServer
        .getRequests()
        .find(r => r.pathname.includes('/releases/tags/'));
      expect(apiRequest.headers.authorization).toBe('token secret-token');
    });

    test('selects linux amd64 tarball on x64 host', async () => {
      await download.installCriCtl({});
      const downloadRequests = testServer
        .getRequests()
        .filter(r => r.pathname.startsWith('/download/'));
      expect(downloadRequests).toHaveLength(1);
      expect(downloadRequests[0].pathname).toBe(
        '/download/crictl-amd64.tar.gz'
      );
    });

    describe('on arm64 host', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'arch', {value: 'arm64'});
      });

      test('selects linux arm64 tarball, not amd64', async () => {
        await download.installCriCtl({});
        const downloadRequests = testServer
          .getRequests()
          .filter(r => r.pathname.startsWith('/download/'));
        expect(downloadRequests).toHaveLength(1);
        expect(downloadRequests[0].pathname).toBe(
          '/download/crictl-arm64.tar.gz'
        );
      });
    });
  });

  describe('installCriDockerd', () => {
    let binaryTarball;
    let sourceTarball;
    // In-memory file system for /etc/ paths (not writable without sudo)
    // Content must match the tarball — both are initialized from the same constants
    let serviceFiles;

    beforeAll(() => {
      binaryTarball = createTarball({
        'cri-dockerd/cri-dockerd': 'cri-dockerd-binary'
      });
      sourceTarball = createTarball({
        'cri-dockerd-v0.3.24/packaging/systemd/cri-docker.service':
          SERVICE_FILE_CONTENT,
        'cri-dockerd-v0.3.24/packaging/systemd/cri-docker.socket':
          SOCKET_FILE_CONTENT
      });
    });

    beforeEach(() => {
      testServer.get('/repos/Mirantis/cri-dockerd/releases/tags/v0.3.24', {
        assets: [
          {
            name: 'cri-dockerd-0.3.4-3.el7.src.rpm',
            browser_download_url: `${baseUrl}/invalid`
          },
          {
            name: 'cri-dockerd-v0.2.0-darwin-arm64.tar.gz',
            browser_download_url: `${baseUrl}/invalid`
          },
          {
            name: 'cri-dockerd-0.3.4.arm64.tgz',
            browser_download_url: `${baseUrl}/download/cri-dockerd-arm64.tgz`
          },
          {
            name: 'cri-dockerd-0.3.4.amd64.tgz',
            browser_download_url: `${baseUrl}/download/cri-dockerd-amd64.tgz`
          },
          {
            name: 'cri-dockerd-v0.2.0-linux-amd64.tar.gz.md5',
            browser_download_url: `${baseUrl}/invalid`
          }
        ]
      });
      testServer.get('/download/cri-dockerd-amd64.tgz', () => ({
        binary: binaryTarball
      }));
      testServer.get('/download/cri-dockerd-arm64.tgz', () => ({
        binary: binaryTarball
      }));
      testServer.get(
        '/Mirantis/cri-dockerd/archive/refs/tags/v0.3.24.tar.gz',
        () => ({binary: sourceTarball})
      );

      serviceFiles = {
        '/etc/systemd/system/cri-docker.service': SERVICE_FILE_CONTENT,
        '/etc/systemd/system/cri-docker.socket': SOCKET_FILE_CONTENT
      };
      const originalReadFileSync = fs.readFileSync.bind(fs);
      jest.spyOn(fs, 'readFileSync').mockImplementation((filePath, ...args) => {
        if (serviceFiles[filePath] !== undefined) {
          return serviceFiles[filePath];
        }
        return originalReadFileSync(filePath, ...args);
      });
      jest
        .spyOn(fs, 'writeFileSync')
        .mockImplementation((filePath, content, ...args) => {
          if (serviceFiles[filePath] !== undefined) {
            serviceFiles[filePath] = content;
            return;
          }
          return jest
            .requireActual('fs')
            .writeFileSync(filePath, content, ...args);
        });
    });

    afterEach(() => {
      fs.readFileSync.mockRestore();
      fs.writeFileSync.mockRestore();
    });

    test('selects amd64 tgz, skipping rpms, darwin, arm64', async () => {
      await download.installCriDockerd({});
      const requests = testServer.getRequests();
      expect(
        requests.some(r => r.pathname === '/download/cri-dockerd-amd64.tgz')
      ).toBe(true);
    });

    describe('on arm64 host', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'arch', {value: 'arm64'});
      });

      test('selects arm64 tgz, skipping amd64 and darwin', async () => {
        await download.installCriDockerd({});
        const requests = testServer.getRequests();
        expect(
          requests.some(r => r.pathname === '/download/cri-dockerd-arm64.tgz')
        ).toBe(true);
        expect(
          requests.some(r => r.pathname === '/download/cri-dockerd-amd64.tgz')
        ).toBe(false);
      });
    });

    test('extracts binary from real tarball', async () => {
      await download.installCriDockerd({});
      const installCall = exec.logExecSync.mock.calls.find(([cmd]) =>
        cmd.includes('install -m 0755')
      );
      expect(installCall[0]).toMatch(
        /\/cri-dockerd\/cri-dockerd \/usr\/local\/bin\//
      );
    });

    test('creates symlink at /usr/bin/cri-dockerd', async () => {
      await download.installCriDockerd({});
      expect(exec.logExecSync).toHaveBeenCalledWith(
        'sudo ln -sf /usr/local/bin/cri-dockerd /usr/bin/cri-dockerd'
      );
    });

    test('forwards github token', async () => {
      await download.installCriDockerd({githubToken: 'secret-token'});
      const apiRequest = testServer
        .getRequests()
        .find(r => r.pathname.includes('/releases/tags/'));
      expect(apiRequest.headers.authorization).toBe('token secret-token');
    });

    describe('systemd service setup', () => {
      test('adds --network-plugin=cni to service file', async () => {
        await download.installCriDockerd({});
        const content = serviceFiles['/etc/systemd/system/cri-docker.service'];
        expect(content).toContain('--network-plugin=cni');
      });

      test('updates binary path to /usr/local/bin in service file', async () => {
        await download.installCriDockerd({});
        const content = serviceFiles['/etc/systemd/system/cri-docker.service'];
        expect(content).toContain('/usr/local/bin/cri-dockerd');
        expect(content).not.toMatch(/\/usr\/bin\/cri-dockerd/);
      });

      test('replaces socket path with cri-dockerd.sock', async () => {
        await download.installCriDockerd({});
        const content = serviceFiles['/etc/systemd/system/cri-docker.socket'];
        expect(content).toBe('ListenStream=/var/run/cri-dockerd.sock');
      });

      test('enables and starts service', async () => {
        await download.installCriDockerd({});
        expect(exec.logExecSync).toHaveBeenCalledWith(
          'sudo systemctl daemon-reload'
        );
        expect(exec.logExecSync).toHaveBeenCalledWith(
          'sudo systemctl enable cri-docker.service'
        );
        expect(exec.logExecSync).toHaveBeenCalledWith(
          'sudo systemctl enable --now cri-docker.socket'
        );
      });
    });

    test('requests the pinned release tag', async () => {
      await download.installCriDockerd({});
      expect(testServer.getRequests()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pathname: '/repos/Mirantis/cri-dockerd/releases/tags/v0.3.24'
          })
        ])
      );
    });
  });
});
