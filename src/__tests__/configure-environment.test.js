describe('configure-docker module test suite', () => {
  let download;
  let configureEnvironment;
  let logExecSync;
  beforeEach(() => {
    jest.resetModules();
    jest.mock('../exec');
    jest.mock('../download');
    download = require('../download');
    configureEnvironment = require('../configure-environment');
    logExecSync = require('../exec').logExecSync;
  });
  describe('configureEnvironment', () => {
    beforeEach(() => {
      logExecSync.mockImplementation(() => {});
    });
    describe('with driver=docker', () => {
      beforeEach(() => {
        configureEnvironment({driver: 'docker'});
      });
      test('installs conntrack', () => {
        expect(logExecSync).toHaveBeenCalledWith('sudo apt update -y');
        expect(logExecSync).toHaveBeenCalledWith(
          'sudo apt-get install -y conntrack'
        );
      });
      test('waits for docker to be ready', () => {
        expect(logExecSync).toHaveBeenCalledWith(
          "docker version -f '{{.Server.Version}} - {{.Client.Version}}'"
        );
      });
      test('doesn\t install cni plugins', () => {
        expect(download.installCniPlugins).not.toHaveBeenCalled();
      });
    });
    describe('with driver=undefined', () => {
      beforeEach(() => {
        configureEnvironment();
      });
      test('installs conntrack', () => {
        expect(logExecSync).toHaveBeenCalledWith('sudo apt update -y');
        expect(logExecSync).toHaveBeenCalledWith(
          'sudo apt-get install -y conntrack'
        );
      });
      test('installs cni plugins', () => {
        expect(download.installCniPlugins).toHaveBeenCalledTimes(1);
      });
      test('installs crictl', () => {
        expect(download.installCriCtl).toHaveBeenCalledTimes(1);
      });
      test('installs cri-dockerd', () => {
        expect(download.installCriDockerd).toHaveBeenCalledTimes(1);
      });
    });
    describe('with driver=none', () => {
      beforeEach(() => {
        configureEnvironment({driver: 'none'});
      });
      test('installs conntrack', () => {
        expect(logExecSync).toHaveBeenCalledWith('sudo apt update -y');
        expect(logExecSync).toHaveBeenCalledWith(
          'sudo apt-get install -y conntrack'
        );
      });
      test('installs cni plugins', () => {
        expect(download.installCniPlugins).toHaveBeenCalledTimes(1);
      });
      test('installs crictl', () => {
        expect(download.installCriCtl).toHaveBeenCalledTimes(1);
      });
      test('installs cri-dockerd', () => {
        expect(download.installCriDockerd).toHaveBeenCalledTimes(1);
      });
    });
  });
});
