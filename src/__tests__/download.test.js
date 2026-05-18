'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHttpTestServer} = require('./test-utils/http-test-server');
const {createTarball} = require('./test-utils/create-tarball');
const {sha256Hex} = require('./test-utils/sha256-hex');

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

  describe('downloadGitHubArtifact verification guard', () => {
    test('throws when both verifyWithCompanionSha256 and expectedSha256 are provided', async () => {
      await expect(
        download.downloadGitHubArtifact({
          inputs: {},
          releaseUrl: `${baseUrl}/some/release`,
          assetPredicate: () => true,
          verifyWithCompanionSha256: true,
          expectedSha256:
            '0000000000000000000000000000000000000000000000000000000000000000'
        })
      ).rejects.toThrow(/both .* were provided/);
    });

    test('throws when neither verification option is provided', async () => {
      await expect(
        download.downloadGitHubArtifact({
          inputs: {},
          releaseUrl: `${baseUrl}/some/release`,
          assetPredicate: () => true
        })
      ).rejects.toThrow(/neither .* was provided/);
    });
  });

  describe('downloadMinikube', () => {
    const amd64Binary = Buffer.from('fake-minikube-binary');
    const arm64Binary = Buffer.from('fake-minikube-binary-arm64');

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
            browser_download_url: `${baseUrl}/download/minikube-linux-amd64.sha256`
          },
          {
            name: 'minikube-linux-arm64',
            browser_download_url: `${baseUrl}/download/minikube-linux-arm64`
          },
          {
            name: 'minikube-linux-arm64.sha256',
            browser_download_url: `${baseUrl}/download/minikube-linux-arm64.sha256`
          }
        ]
      });
      testServer.get('/download/minikube-linux-amd64', () => ({
        binary: amd64Binary
      }));
      testServer.get('/download/minikube-linux-arm64', () => ({
        binary: arm64Binary
      }));
      testServer.get('/download/minikube-linux-amd64.sha256', () => ({
        binary: Buffer.from(`${sha256Hex(amd64Binary)}\n`)
      }));
      testServer.get('/download/minikube-linux-arm64.sha256', () => ({
        binary: Buffer.from(`${sha256Hex(arm64Binary)}\n`)
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
        .filter(
          r =>
            r.pathname.startsWith('/download/') &&
            !r.pathname.endsWith('.sha256')
        );
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

    test('fetches the .sha256 companion asset', async () => {
      await download.downloadMinikube({minikubeVersion: 'v1.33.7'});
      expect(
        testServer
          .getRequests()
          .some(r => r.pathname === '/download/minikube-linux-amd64.sha256')
      ).toBe(true);
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
          .filter(
            r =>
              r.pathname.startsWith('/download/') &&
              !r.pathname.endsWith('.sha256')
          );
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

    describe('with a tampered binary (sha256 mismatch)', () => {
      let error;

      beforeEach(async () => {
        testServer.get('/download/minikube-linux-amd64.sha256', () => ({
          binary: Buffer.from(`${'0'.repeat(64)}\n`)
        }));
        try {
          await download.downloadMinikube({minikubeVersion: 'v1.33.7'});
        } catch (e) {
          error = e;
        }
      });

      test('throws naming the asset', () => {
        expect(error.message).toMatch(/SHA256 mismatch.*minikube-linux-amd64/);
      });
    });

    describe('with no .sha256 companion asset published', () => {
      let error;

      beforeEach(async () => {
        testServer.clearRoutes();
        testServer.get('/repos/kubernetes/minikube/releases/tags/v1.33.7', {
          assets: [
            {
              name: 'minikube-linux-amd64',
              browser_download_url: `${baseUrl}/download/minikube-linux-amd64`
            }
          ]
        });
        testServer.get('/download/minikube-linux-amd64', () => ({
          binary: amd64Binary
        }));
        try {
          await download.downloadMinikube({minikubeVersion: 'v1.33.7'});
        } catch (e) {
          error = e;
        }
      });

      test('throws indicating the missing companion', () => {
        expect(error.message).toMatch(
          /No .*\.sha256.* companion.*minikube-linux-amd64/
        );
      });
    });

    describe('with a malformed .sha256 companion response (empty body)', () => {
      let error;

      beforeEach(async () => {
        testServer.get('/download/minikube-linux-amd64.sha256', () => ({
          binary: Buffer.from('')
        }));
        try {
          await download.downloadMinikube({minikubeVersion: 'v1.33.7'});
        } catch (e) {
          error = e;
        }
      });

      test('throws indicating the malformed digest', () => {
        expect(error.message).toMatch(/Invalid SHA256 digest/);
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
              name: 'cni-plugins-linux-amd64-v1.9.0.tgz.sha256',
              browser_download_url: `${baseUrl}/download/cni-plugins-amd64.tgz.sha256`
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
              name: 'cni-plugins-linux-arm64-v1.9.0.tgz.sha256',
              browser_download_url: `${baseUrl}/download/cni-plugins-arm64.tgz.sha256`
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
      testServer.get('/download/cni-plugins-amd64.tgz.sha256', () => ({
        binary: Buffer.from(
          `${sha256Hex(cniTarball)}  cni-plugins-linux-amd64-v1.9.0.tgz\n`
        )
      }));
      testServer.get('/download/cni-plugins-arm64.tgz.sha256', () => ({
        binary: Buffer.from(
          `${sha256Hex(cniTarball)}  cni-plugins-linux-arm64-v1.9.0.tgz\n`
        )
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

    test('fetches the .sha256 companion asset', async () => {
      await download.installCniPlugins({});
      expect(
        testServer
          .getRequests()
          .some(r => r.pathname === '/download/cni-plugins-amd64.tgz.sha256')
      ).toBe(true);
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
        .filter(
          r =>
            r.pathname.startsWith('/download/') &&
            !r.pathname.endsWith('.sha256')
        );
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
          .filter(
            r =>
              r.pathname.startsWith('/download/') &&
              !r.pathname.endsWith('.sha256')
          );
        expect(downloadRequests).toHaveLength(1);
        expect(downloadRequests[0].pathname).toBe(
          '/download/cni-plugins-arm64.tgz'
        );
      });
    });

    describe('with a tampered tarball (sha256 mismatch)', () => {
      let error;

      beforeEach(async () => {
        testServer.get('/download/cni-plugins-amd64.tgz.sha256', () => ({
          binary: Buffer.from(
            `${'0'.repeat(64)}  cni-plugins-linux-amd64-v1.9.0.tgz\n`
          )
        }));
        try {
          await download.installCniPlugins({});
        } catch (e) {
          error = e;
        }
      });

      test('throws naming the asset', () => {
        expect(error.message).toMatch(
          /SHA256 mismatch.*cni-plugins-linux-amd64-v1\.9\.0\.tgz/
        );
      });
    });

    describe('with no .sha256 companion asset published', () => {
      let error;

      beforeEach(async () => {
        testServer.clearRoutes();
        testServer.get(
          '/repos/containernetworking/plugins/releases/tags/v1.9.0',
          {
            assets: [
              {
                name: 'cni-plugins-linux-amd64-v1.9.0.tgz',
                browser_download_url: `${baseUrl}/download/cni-plugins-amd64.tgz`
              }
            ]
          }
        );
        testServer.get('/download/cni-plugins-amd64.tgz', () => ({
          binary: cniTarball
        }));
        try {
          await download.installCniPlugins({});
        } catch (e) {
          error = e;
        }
      });

      test('throws indicating the missing companion', () => {
        expect(error.message).toMatch(
          /No .*\.sha256.* companion.*cni-plugins-linux-amd64-v1\.9\.0\.tgz/
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
            name: 'crictl-linux-amd64.tar.gz.sha256',
            browser_download_url: `${baseUrl}/download/crictl-amd64.tar.gz.sha256`
          },
          {
            name: 'crictl-linux-arm64.tar.gz',
            browser_download_url: `${baseUrl}/download/crictl-arm64.tar.gz`
          },
          {
            name: 'crictl-linux-arm64.tar.gz.sha256',
            browser_download_url: `${baseUrl}/download/crictl-arm64.tar.gz.sha256`
          }
        ]
      });
      testServer.get('/download/crictl-amd64.tar.gz', () => ({
        binary: crictlTarball
      }));
      testServer.get('/download/crictl-arm64.tar.gz', () => ({
        binary: crictlTarball
      }));
      testServer.get('/download/crictl-amd64.tar.gz.sha256', () => ({
        binary: Buffer.from(
          `${sha256Hex(crictlTarball)}  crictl-linux-amd64.tar.gz\n`
        )
      }));
      testServer.get('/download/crictl-arm64.tar.gz.sha256', () => ({
        binary: Buffer.from(
          `${sha256Hex(crictlTarball)}  crictl-linux-arm64.tar.gz\n`
        )
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

    test('fetches the .sha256 companion asset', async () => {
      await download.installCriCtl({});
      expect(
        testServer
          .getRequests()
          .some(r => r.pathname === '/download/crictl-amd64.tar.gz.sha256')
      ).toBe(true);
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
        .filter(
          r =>
            r.pathname.startsWith('/download/') &&
            !r.pathname.endsWith('.sha256')
        );
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
          .filter(
            r =>
              r.pathname.startsWith('/download/') &&
              !r.pathname.endsWith('.sha256')
          );
        expect(downloadRequests).toHaveLength(1);
        expect(downloadRequests[0].pathname).toBe(
          '/download/crictl-arm64.tar.gz'
        );
      });
    });

    describe('with a tampered tarball (sha256 mismatch)', () => {
      let error;

      beforeEach(async () => {
        testServer.get('/download/crictl-amd64.tar.gz.sha256', () => ({
          binary: Buffer.from(`${'0'.repeat(64)}  crictl-linux-amd64.tar.gz\n`)
        }));
        try {
          await download.installCriCtl({});
        } catch (e) {
          error = e;
        }
      });

      test('throws naming the asset', () => {
        expect(error.message).toMatch(
          /SHA256 mismatch.*crictl-linux-amd64\.tar\.gz/
        );
      });
    });

    describe('with no .sha256 companion asset published', () => {
      let error;

      beforeEach(async () => {
        testServer.clearRoutes();
        testServer.get(
          '/repos/kubernetes-sigs/cri-tools/releases/tags/v1.35.0',
          {
            assets: [
              {
                name: 'crictl-linux-amd64.tar.gz',
                browser_download_url: `${baseUrl}/download/crictl-amd64.tar.gz`
              }
            ]
          }
        );
        testServer.get('/download/crictl-amd64.tar.gz', () => ({
          binary: crictlTarball
        }));
        try {
          await download.installCriCtl({});
        } catch (e) {
          error = e;
        }
      });

      test('throws indicating the missing companion', () => {
        expect(error.message).toMatch(
          /No .*\.sha256.* companion.*crictl-linux-amd64\.tar\.gz/
        );
      });
    });
  });

  describe('installCriDockerd', () => {
    let binaryTarball;
    let sourceTarball;
    let binaryTarballSha;
    let sourceTarballSha;
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
      binaryTarballSha = sha256Hex(binaryTarball);
      sourceTarballSha = sha256Hex(sourceTarball);
    });

    beforeEach(() => {
      jest.resetModules();
      jest.doMock('../checksums', () => ({
        criDockerd: {
          tag: 'v0.3.24',
          binarySha256: {
            amd64: binaryTarballSha,
            arm64: binaryTarballSha
          },
          sourceSha256: sourceTarballSha
        }
      }));
      exec = require('../exec');
      download = require('../download');
      tc = require('@actions/tool-cache');
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

    describe('with a tampered binary tarball (sha256 mismatch)', () => {
      let error;

      beforeEach(async () => {
        jest.resetModules();
        jest.doMock('../checksums', () => ({
          criDockerd: {
            tag: 'v0.3.24',
            binarySha256: {
              amd64: '0'.repeat(64),
              arm64: '0'.repeat(64)
            },
            sourceSha256: sourceTarballSha
          }
        }));
        const tamperedDownload = require('../download');
        try {
          await tamperedDownload.installCriDockerd({});
        } catch (e) {
          error = e;
        }
      });

      test('throws naming the asset', () => {
        expect(error.message).toMatch(
          /SHA256 mismatch.*cri-dockerd-0\.3\.4\.amd64\.tgz/
        );
      });
    });

    describe('with no pinned digest for the current arch', () => {
      let error;

      beforeEach(async () => {
        jest.resetModules();
        jest.doMock('../checksums', () => ({
          criDockerd: {
            tag: 'v0.3.24',
            binarySha256: {},
            sourceSha256: sourceTarballSha
          }
        }));
        const archlessDownload = require('../download');
        try {
          await archlessDownload.installCriDockerd({});
        } catch (e) {
          error = e;
        }
      });

      test('throws an arch-specific diagnostic', () => {
        expect(error.message).toMatch(
          /No pinned SHA256 for arch=.* in checksums\.criDockerd\.binarySha256/
        );
      });
    });

    describe('with a tampered source tarball (sha256 mismatch)', () => {
      let error;

      beforeEach(async () => {
        jest.resetModules();
        jest.doMock('../checksums', () => ({
          criDockerd: {
            tag: 'v0.3.24',
            binarySha256: {
              amd64: binaryTarballSha,
              arm64: binaryTarballSha
            },
            sourceSha256: '0'.repeat(64)
          }
        }));
        const tamperedDownload = require('../download');
        try {
          await tamperedDownload.installCriDockerd({});
        } catch (e) {
          error = e;
        }
      });

      test('throws naming the source archive', () => {
        expect(error.message).toMatch(/SHA256 mismatch.*cri-dockerd source/);
      });
    });
  });
});
