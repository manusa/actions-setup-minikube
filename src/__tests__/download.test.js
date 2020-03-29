describe('download module test suite', () => {
  let download;
  let axios;
  let tc;
  beforeEach(() => {
    jest.resetModules();
    jest.mock('@actions/io', () => ({}));
    jest.mock('@actions/tool-cache');
    jest.mock('@actions/core');
    jest.mock('axios');
    tc = require('@actions/tool-cache');
    axios = require('axios');
    download = require('../download');
    axios.mockImplementationOnce(async () => ({
      data: {
        assets: [
          {
            name: 'minikube-windows-amd64.exe',
            browser_download_url: 'http://invalid'
          },
          {name: 'minikube-linux-amd64', browser_download_url: 'http://valid'},
          {
            name: 'minikube-linux-amd64.sha256',
            browser_download_url: 'http://invalid'
          }
        ]
      }
    }));
  });
  test('download, should download valid Linux version', async () => {
    // Given
    const inputs = {minikubeVersion: 'v1.33.7'};
    tc.downloadTool.mockImplementationOnce(async () => {});
    // When
    await download(inputs);
    // Then
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url:
          'https://api.github.com/repos/kubernetes/minikube/releases/tags/v1.33.7'
      })
    );
    expect(tc.downloadTool).toHaveBeenCalledWith('http://valid');
  });
  test('download with token, should download valid Linux version', async () => {
    // Given
    const inputs = {minikubeVersion: 'v1.33.7', githubToken: 'secret-token'};
    tc.downloadTool.mockImplementationOnce(async () => {});
    // When
    await download(inputs);
    // Then
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url:
          'https://api.github.com/repos/kubernetes/minikube/releases/tags/v1.33.7',
        headers: {Authorization: 'token secret-token'}
      })
    );
    expect(tc.downloadTool).toHaveBeenCalledWith('http://valid');
  });
});
