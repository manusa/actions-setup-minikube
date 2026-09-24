'use strict';

const fs = require('node:fs');

describe('install', () => {
  let core;
  let io;
  let exec;
  let checkKubernetesVersion;
  let install;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('@actions/core');
    jest.mock('@actions/io', () => ({
      mkdirP: jest.fn(),
      mv: jest.fn()
    }));
    jest.mock('../exec');
    jest.mock('../check-kubernetes-version', () => ({
      checkKubernetesVersion: jest.fn().mockResolvedValue('supported'),
      SUPPORTED: 'supported',
      UNSUPPORTED: 'unsupported'
    }));
    core = require('@actions/core');
    io = require('@actions/io');
    exec = require('../exec');
    checkKubernetesVersion =
      require('../check-kubernetes-version').checkKubernetesVersion;
    install = require('../install');
    exec.logExecSync.mockImplementation();
    exec.execSync.mockReturnValue('minikube version: v1.33.7');
  });

  const findStartCommand = () =>
    exec.logExecSync.mock.calls.find(([cmd]) =>
      cmd.includes('minikube start')
    )?.[0];

  describe('binary installation', () => {
    beforeEach(async () => {
      await install('/tmp/runner/minikube-binary', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.33.7'
      });
    });

    test('makes the binary executable', () => {
      expect(exec.logExecSync).toHaveBeenCalledWith(
        'chmod +x /tmp/runner/minikube-binary'
      );
    });

    test('creates .minikube directory for compatibility', () => {
      expect(io.mkdirP).toHaveBeenCalledWith('/tmp/runner/.minikube');
    });

    test('renames binary to minikube', () => {
      expect(io.mv).toHaveBeenCalledWith(
        '/tmp/runner/minikube-binary',
        '/tmp/runner/minikube'
      );
    });

    test('sets MINIKUBE_HOME to binary directory', () => {
      expect(core.exportVariable).toHaveBeenCalledWith(
        'MINIKUBE_HOME',
        '/tmp/runner'
      );
    });

    test('adds binary directory to PATH', () => {
      expect(core.addPath).toHaveBeenCalledWith('/tmp/runner');
    });
  });

  describe('start command', () => {
    test('includes kubernetes version', async () => {
      await install('/tmp/runner/minikube', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.33.7'
      });
      expect(findStartCommand()).toContain('--kubernetes-version v1.33.7');
    });

    test('includes vm-driver', async () => {
      await install('/tmp/runner/minikube', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.33.7',
        driver: 'docker'
      });
      expect(findStartCommand()).toContain('--vm-driver=docker');
    });

    test('includes container runtime when specified', async () => {
      await install('/tmp/runner/minikube', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.33.7',
        containerRuntime: 'containerd'
      });
      expect(findStartCommand()).toContain('--container-runtime=containerd');
    });

    test('includes start args', async () => {
      await install('/tmp/runner/minikube', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.33.7',
        startArgs: '--extra-config=kubelet.max-pods=50'
      });
      expect(findStartCommand()).toContain(
        '--extra-config=kubelet.max-pods=50'
      );
    });

    // sudo-rs (default sudo since Ubuntu 25.10) ignores -E; classic sudo
    // ships alongside it as /usr/bin/sudo.ws
    describe('with none driver', () => {
      const givenSudoWs = exists => {
        const originalExistsSync = fs.existsSync.bind(fs);
        jest
          .spyOn(fs, 'existsSync')
          .mockImplementation(p =>
            p === '/usr/bin/sudo.ws' ? exists : originalExistsSync(p)
          );
      };
      const startNone = () =>
        install('/tmp/runner/minikube', {
          minikubeVersion: 'v1.33.7',
          kubernetesVersion: 'v1.33.7',
          driver: 'none'
        });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      describe('when classic sudo is installed as sudo.ws', () => {
        beforeEach(async () => {
          givenSudoWs(true);
          await startNone();
        });

        test('runs minikube start through sudo.ws -E', () => {
          expect(findStartCommand()).toMatch(
            /^\/usr\/bin\/sudo\.ws -E \/tmp\/runner\/minikube start /
          );
        });
      });

      describe('when only the default sudo is available', () => {
        beforeEach(async () => {
          givenSudoWs(false);
          await startNone();
        });

        test('runs minikube start through sudo -E', () => {
          expect(findStartCommand()).toMatch(/^sudo -E /);
        });

        // Classic sudo logs the values of explicitly preserved variables, so
        // the list must never grow beyond these non-secret paths
        test('explicitly preserves only HOME and MINIKUBE_HOME', () => {
          expect(findStartCommand()).toMatch(
            /^sudo -E --preserve-env=HOME,MINIKUBE_HOME \/tmp\/runner\/minikube start /
          );
        });
      });
    });

    test('does not use sudo for docker driver', async () => {
      await install('/tmp/runner/minikube', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.33.7',
        driver: 'docker'
      });
      expect(findStartCommand()).not.toContain('sudo');
    });
  });

  describe('with supported kubernetes version', () => {
    beforeEach(async () => {
      await install('/tmp/runner/minikube', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.33.7',
        startArgs: ''
      });
    });

    test('does not add --force flag', () => {
      expect(findStartCommand()).not.toContain('--force');
    });

    test('does not set force output', () => {
      expect(core.setOutput).not.toHaveBeenCalledWith('force', 'true');
    });
  });

  describe('with unsupported kubernetes version', () => {
    beforeEach(async () => {
      checkKubernetesVersion.mockResolvedValue('unsupported');
      await install('/tmp/runner/minikube', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.99.0',
        startArgs: ''
      });
    });

    test('adds --force flag to start command', () => {
      expect(findStartCommand()).toContain('--force');
    });

    test('warns about the force flag', () => {
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('--force')
      );
    });

    test('sets force output', () => {
      expect(core.setOutput).toHaveBeenCalledWith('force', 'true');
    });
  });

  describe('version check ordering', () => {
    test('checks kubernetes version before starting minikube', async () => {
      const callOrder = [];
      checkKubernetesVersion.mockImplementation(async () => {
        callOrder.push('checkKubernetesVersion');
        return 'supported';
      });
      exec.logExecSync.mockImplementation(cmd => {
        if (cmd.includes('minikube start')) callOrder.push('start');
      });
      await install('/tmp/runner/minikube', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.33.7'
      });
      expect(callOrder.indexOf('checkKubernetesVersion')).toBeLessThan(
        callOrder.indexOf('start')
      );
    });
  });
});
