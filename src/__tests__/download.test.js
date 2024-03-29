describe('download module test suite', () => {
  let download;
  let axios;
  let tc;
  beforeEach(() => {
    jest.resetModules();
    jest.mock('fs', () => ({
      promises: {},
      constants: {}
    }));
    jest.mock('@actions/tool-cache');
    jest.mock('@actions/core');
    jest.mock('axios');
    jest.mock('../exec');
    tc = require('@actions/tool-cache');
    axios = require('axios');
    download = require('../download');
  });
  describe('downloadMinikube', () => {
    beforeEach(() => {
      axios.mockImplementationOnce(async () => ({
        data: {
          assets: [
            {
              name: 'minikube-windows-amd64.exe',
              browser_download_url: 'http://invalid'
            },
            {
              name: 'minikube-linux-amd64',
              browser_download_url: 'http://valid'
            },
            {
              name: 'minikube-linux-amd64.sha256',
              browser_download_url: 'http://invalid'
            }
          ]
        }
      }));
    });
    test('should download valid Linux version', async () => {
      // Given
      const inputs = {minikubeVersion: 'v1.33.7'};
      tc.downloadTool.mockImplementationOnce(async () => {});
      // When
      await download.downloadMinikube(inputs);
      // Then
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.github.com/repos/kubernetes/minikube/releases/tags/v1.33.7'
        })
      );
      expect(tc.downloadTool).toHaveBeenCalledWith('http://valid');
    });
    test('with token, should download valid Linux version', async () => {
      // Given
      const inputs = {minikubeVersion: 'v1.33.7', githubToken: 'secret-token'};
      tc.downloadTool.mockImplementationOnce(async () => {});
      // When
      await download.downloadMinikube(inputs);
      // Then
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.github.com/repos/kubernetes/minikube/releases/tags/v1.33.7',
          headers: {Authorization: 'token secret-token'}
        })
      );
      expect(tc.downloadTool).toHaveBeenCalledWith('http://valid');
    });
  });

  describe('installCniPlugins with token', () => {
    let exec;
    beforeEach(() => {
      exec = require('../exec');
      axios.mockImplementationOnce(async () => ({
        data: {
          assets: [
            {
              name: 'cni-plugins-linux-amd64-v1.3.0.tgz.sha1',
              browser_download_url: 'http://invalid'
            },
            {
              name: 'cni-plugins-linux-amd64-v1.3.0.tgz',
              browser_download_url: 'http://valid'
            },
            {
              name: 'cni-plugins-linux-amd64-v1.3.0.tgz.sha512',
              browser_download_url: 'http://invalid'
            },
            {
              name: 'cni-plugins-windows-amd64-v1.3.0.tgz',
              browser_download_url: 'http://invalid'
            }
          ]
        }
      }));
      tc.downloadTool.mockImplementationOnce(async () => 'file.tar.gz');
    });
    test('should download valid Linux version', async () => {
      // When
      await download.installCniPlugins({githubToken: 'secret-token'});
      // Then
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.github.com/repos/containernetworking/plugins/releases/tags/v1.3.0',
          headers: {Authorization: 'token secret-token'}
        })
      );
      expect(tc.downloadTool).toHaveBeenCalledWith('http://valid');
    });
    test('should install binaries', async () => {
      // When
      await download.installCniPlugins();
      // Then
      expect(tc.extractTar).toHaveBeenCalledWith('file.tar.gz');
      expect(exec.logExecSync).toHaveBeenCalledWith(
        expect.stringMatching(
          /sudo find .+ -type f -exec install -Dm 0755 .+\/opt\/cni\/bin.+/
        )
      );
    });
  });

  describe('installCriCtl', () => {
    beforeEach(() => {
      axios.mockImplementationOnce(async () => ({
        data: {
          assets: [
            {
              name: 'crictl-windows-amd64.exe',
              browser_download_url: 'http://invalid'
            },
            {
              name: 'crictl-linux-amd64.tar.gz',
              browser_download_url: 'http://valid'
            },
            {
              name: 'crictl-linux-amd64.sha256',
              browser_download_url: 'http://invalid'
            }
          ]
        }
      }));
    });
    test('with token, should download valid Linux version', async () => {
      // Given
      tc.downloadTool.mockImplementationOnce(async () => 'file.tar.gz');
      // When
      await download.installCriCtl({githubToken: 'secret-token'});
      // Then
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.github.com/repos/kubernetes-sigs/cri-tools/releases/tags/v1.28.0',
          headers: {Authorization: 'token secret-token'}
        })
      );
      expect(tc.downloadTool).toHaveBeenCalledWith('http://valid');
      expect(tc.extractTar).toHaveBeenCalledWith(
        'file.tar.gz',
        '/usr/local/bin'
      );
    });
  });

  describe('installCriDockerd with token', () => {
    let fs;
    let exec;
    beforeEach(() => {
      fs = require('fs');
      exec = require('../exec');
      axios.mockImplementationOnce(async () => ({
        data: {
          assets: [
            {
              name: 'cri-dockerd-0.3.4-3.el7.src.rpm',
              browser_download_url: 'http://invalid'
            },
            {
              name: 'cri-dockerd-0.3.4-3.el7.src.rpm',
              browser_download_url: 'http://invalid'
            },
            {
              name: 'cri-dockerd-v0.2.0-darwin-arm64.tar.gz',
              browser_download_url: 'http://invalid'
            },
            {
              name: 'cri-dockerd-0.3.4.arm64.tgz',
              browser_download_url: 'http://invalid'
            },
            {
              name: 'cri-dockerd-0.3.4.amd64.tgz',
              browser_download_url: 'http://valid'
            },
            {
              name: 'cri-dockerd-v0.2.0-linux-amd64.tar.gz.md5',
              browser_download_url: 'http://invalid'
            }
          ]
        }
      }));
      tc.downloadTool.mockImplementationOnce(async () => 'cri-dockerd.tgz');
      fs.readdirSync = jest.fn(() => [
        {isDirectory: () => true, name: 'cri-dockerd'}
      ]);
      fs.readFileSync = jest.fn(() => '');
      fs.writeFileSync = jest.fn();
    });
    test('should download Linux version', async () => {
      // When
      await download.installCriDockerd({githubToken: 'secret-token'});
      // Then
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.github.com/repos/Mirantis/cri-dockerd/releases/tags/v0.3.4',
          headers: {Authorization: 'token secret-token'}
        })
      );
      expect(tc.downloadTool).toHaveBeenCalledWith('http://valid');
    });
    test('should install cri-dockerd binary', async () => {
      // When
      await download.installCriDockerd();
      // Then
      expect(tc.extractTar).toHaveBeenCalledWith('cri-dockerd.tgz');
      expect(exec.logExecSync).toHaveBeenCalledWith(
        expect.stringMatching(
          /sudo install -m 0755 .+\/cri-dockerd\/cri-dockerd \/usr\/local\/bin\//
        )
      );
      expect(exec.logExecSync).toHaveBeenCalledWith(
        'sudo ln -sf /usr/local/bin/cri-dockerd /usr/bin/cri-dockerd'
      );
    });
    describe('should install cri-dockerd service', () => {
      test('should copy systemd service files', async () => {
        // When
        await download.installCriDockerd();
        // Then
        expect(exec.logExecSync).toHaveBeenCalledWith(
          expect.stringMatching(
            /sudo cp -a .+\/packaging\/systemd\/\* \/etc\/systemd\/system/
          )
        );
      });
      test('should add --network-plugin=cni to systemd service file', async () => {
        // Given
        fs.readFileSync.mockImplementation(
          () =>
            'ExecStart=/usr/bin/cri-dockerd --container-runtime-endpoint fd://'
        );
        // When
        await download.installCriDockerd();
        // Then
        expect(fs.writeFileSync).toHaveBeenCalledWith(
          '/etc/systemd/system/cri-docker.service',
          'ExecStart=/usr/bin/cri-dockerd --network-plugin=cni --container-runtime-endpoint fd://'
        );
      });
      test('should replace binary location in systemd service file', async () => {
        // Given
        fs.readFileSync.mockImplementation(
          () =>
            'ExecStart=/usr/bin/cri-dockerd --container-runtime-endpoint fd://'
        );
        // When
        await download.installCriDockerd();
        // Then
        expect(fs.writeFileSync).toHaveBeenCalledWith(
          '/etc/systemd/system/cri-docker.service',
          'ExecStart=/usr/local/bin/cri-dockerd --container-runtime-endpoint fd://'
        );
      });
      test('should enable and start service', async () => {
        // When
        await download.installCriDockerd();
        // Then
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
  });
});
