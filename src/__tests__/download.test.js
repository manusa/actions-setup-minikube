describe('download module test suite', () => {
  let download;
  let axios;
  let tc;
  beforeEach(() => {
    jest.resetModules();
    jest.mock('fs', () => ({
      promises: {}
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
          url: 'https://api.github.com/repos/kubernetes-sigs/cri-tools/releases/latest',
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

  describe('installCriDockerd', () => {
    let fs;
    let exec;
    beforeEach(() => {
      fs = require('fs');
      exec = require('../exec');
      axios.mockImplementationOnce(async () => ({
        data: {
          assets: [
            {
              name: 'cri-dockerd-v0.2.0-darwin-arm64.tar.gz',
              browser_download_url: 'http://invalid'
            },
            {
              name: 'cri-dockerd-v0.2.0-linux-amd64.tar.gz',
              browser_download_url: 'http://valid'
            },
            {
              name: 'cri-dockerd-v0.2.0-linux-amd64.tar.gz.md5',
              browser_download_url: 'http://invalid'
            }
          ]
        }
      }));
      fs.readdirSync = jest.fn(() => [
        {isDirectory: () => true, name: 'cri-dockerd'}
      ]);
      fs.readFileSync = jest.fn(() => '');
      fs.writeFileSync = jest.fn();
    });
    test('with token, should download and install valid Linux version', async () => {
      // Given
      tc.downloadTool.mockImplementationOnce(async () => 'cri-dockerd.tar.gz');
      // When
      await download.installCriDockerd({githubToken: 'secret-token'});
      // Then
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.github.com/repos/Mirantis/cri-dockerd/releases/tags/v0.2.0',
          headers: {Authorization: 'token secret-token'}
        })
      );
      expect(tc.downloadTool).toHaveBeenCalledWith('http://valid');
      expect(tc.extractTar).toHaveBeenCalledWith(
        'cri-dockerd.tar.gz',
        '/usr/local/bin'
      );
      expect(exec.logExecSync).toHaveBeenCalledTimes(4);
      expect(exec.logExecSync).toHaveBeenCalledWith(
        expect.stringMatching(
          /sudo cp -a .+\/packaging\/systemd\/\* \/etc\/systemd\/system/
        )
      );
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
