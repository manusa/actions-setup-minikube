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
      cmd.includes("minikube' start")
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
        "chmod +x '/tmp/runner/minikube-binary'"
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

  describe('with a minikube directory containing spaces', () => {
    beforeEach(async () => {
      await install('/tmp/runner dir/minikube-binary', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.33.7',
        driver: 'docker'
      });
    });

    test('quotes the binary path when making it executable', () => {
      expect(exec.logExecSync).toHaveBeenCalledWith(
        "chmod +x '/tmp/runner dir/minikube-binary'"
      );
    });

    test('quotes the binary path in the start command', () => {
      expect(findStartCommand()).toMatch(
        /^'\/tmp\/runner dir\/minikube' start /
      );
    });

    test('quotes the paths when changing config ownership', () => {
      expect(exec.logExecSync).toHaveBeenCalledWith(
        `sudo chown -R $USER "$HOME/.kube" '/tmp/runner dir/.minikube'`
      );
    });

    test('quotes the paths when making config readable', () => {
      expect(exec.logExecSync).toHaveBeenCalledWith(
        `sudo chmod -R a+r "$HOME/.kube" '/tmp/runner dir/.minikube'`
      );
    });

    test('quotes the path when restricting ssh key permissions', () => {
      expect(exec.logExecSync).toHaveBeenCalledWith(
        "sudo find '/tmp/runner dir/.minikube' -name id_rsa -exec chmod 600 {} \\;"
      );
    });
  });

  describe('start command', () => {
    test('includes kubernetes version', async () => {
      await install('/tmp/runner/minikube', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.33.7'
      });
      expect(findStartCommand()).toContain("--kubernetes-version 'v1.33.7'");
    });

    // A validated version is a plain tag, so quoting it changes nothing for
    // working values but stops shell syntax that slips past the tag check
    test('quotes the kubernetes version', async () => {
      await install('/tmp/runner/minikube', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.35.2#;id;#'
      });
      expect(findStartCommand()).toContain(
        "--kubernetes-version 'v1.35.2#;id;#'"
      );
    });

    test('includes vm-driver', async () => {
      await install('/tmp/runner/minikube', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.33.7',
        driver: 'docker'
      });
      expect(findStartCommand()).toContain('--vm-driver=docker');
    });

    // Minikube v1.39.0+ defaults to containerd, the action keeps docker
    describe('container runtime', () => {
      let originalEnvRuntime;
      const startWith = inputs =>
        install('/tmp/runner/minikube', {
          minikubeVersion: 'v1.33.7',
          kubernetesVersion: 'v1.33.7',
          ...inputs
        });

      beforeEach(() => {
        originalEnvRuntime = process.env.MINIKUBE_CONTAINER_RUNTIME;
        delete process.env.MINIKUBE_CONTAINER_RUNTIME;
      });

      afterEach(() => {
        if (originalEnvRuntime === undefined) {
          delete process.env.MINIKUBE_CONTAINER_RUNTIME;
        } else {
          process.env.MINIKUBE_CONTAINER_RUNTIME = originalEnvRuntime;
        }
      });

      describe('when not specified', () => {
        beforeEach(async () => {
          await startWith({});
        });

        test('defaults to docker', () => {
          expect(findStartCommand()).toContain('--container-runtime=docker');
        });
      });

      // core.getInput returns '' for an input the workflow doesn't set
      describe('when the input is empty', () => {
        beforeEach(async () => {
          await startWith({containerRuntime: ''});
        });

        test('defaults to docker', () => {
          expect(findStartCommand()).toContain('--container-runtime=docker');
        });
      });

      describe('when not specified with the docker driver', () => {
        beforeEach(async () => {
          await startWith({containerRuntime: '', driver: 'docker'});
        });

        test('defaults to docker', () => {
          expect(findStartCommand()).toContain('--container-runtime=docker');
        });
      });

      describe('when specified', () => {
        beforeEach(async () => {
          await startWith({containerRuntime: 'containerd'});
        });

        test('uses the specified runtime', () => {
          expect(findStartCommand()).toContain(
            '--container-runtime=containerd'
          );
        });

        test('does not add the docker default', () => {
          expect(findStartCommand()).not.toContain(
            '--container-runtime=docker'
          );
        });
      });

      describe('when not specified but set in MINIKUBE_CONTAINER_RUNTIME', () => {
        beforeEach(async () => {
          process.env.MINIKUBE_CONTAINER_RUNTIME = 'containerd';
          await startWith({});
        });

        test('leaves the runtime to minikube', () => {
          expect(findStartCommand()).not.toContain('--container-runtime');
        });
      });

      // minikube ignores an empty MINIKUBE_CONTAINER_RUNTIME
      describe('when not specified and MINIKUBE_CONTAINER_RUNTIME is empty', () => {
        beforeEach(async () => {
          process.env.MINIKUBE_CONTAINER_RUNTIME = '';
          await startWith({containerRuntime: ''});
        });

        test('defaults to docker', () => {
          expect(findStartCommand()).toContain('--container-runtime=docker');
        });
      });

      describe('when specified and set in MINIKUBE_CONTAINER_RUNTIME', () => {
        beforeEach(async () => {
          process.env.MINIKUBE_CONTAINER_RUNTIME = 'containerd';
          await startWith({containerRuntime: 'cri-o'});
        });

        test('uses the specified runtime', () => {
          expect(findStartCommand()).toContain('--container-runtime=cri-o');
        });
      });

      // minikube keeps the last value of a repeated flag
      describe('when not specified but passed in start args', () => {
        beforeEach(async () => {
          await startWith({startArgs: '--container-runtime=containerd'});
        });

        test('adds the docker default before start args so they win', () => {
          expect(findStartCommand()).toMatch(
            /--container-runtime=docker .*--container-runtime=containerd$/
          );
        });
      });
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

    // start args is evaluated by the shell (word splitting, quotes, $VAR),
    // which existing workflows rely on, so it must be appended verbatim
    test('appends start args verbatim for the shell to evaluate', async () => {
      const startArgs =
        '--memory=$MINIKUBE_MEM --insecure-registry "10.0.0.0/24" --cpus=\'2\'';
      await install('/tmp/runner/minikube', {
        minikubeVersion: 'v1.33.7',
        kubernetesVersion: 'v1.33.7',
        driver: 'docker',
        startArgs
      });
      expect(findStartCommand().endsWith(` ${startArgs}`)).toBe(true);
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

      // Classic sudo logs the values of explicitly preserved variables, so
      // the fallback list must never grow beyond these non-secret paths
      const fallbackStart =
        /^sudo -E --preserve-env=HOME,MINIKUBE_HOME '\/tmp\/runner\/minikube' start /;

      describe('when classic sudo is installed as sudo.ws and usable', () => {
        beforeEach(async () => {
          givenSudoWs(true);
          await startNone();
        });

        test('runs minikube start through sudo.ws -E', () => {
          expect(findStartCommand()).toMatch(
            /^\/usr\/bin\/sudo\.ws -E '\/tmp\/runner\/minikube' start /
          );
        });
      });

      describe('when classic sudo is installed as sudo.ws but not usable', () => {
        beforeEach(async () => {
          givenSudoWs(true);
          exec.execSync.mockImplementation(cmd => {
            if (cmd.startsWith('/usr/bin/sudo.ws')) {
              throw new Error('sudo: a password is required');
            }
            return 'minikube version: v1.33.7';
          });
          await startNone();
        });

        test('falls back to sudo -E preserving only HOME and MINIKUBE_HOME', () => {
          expect(findStartCommand()).toMatch(fallbackStart);
        });
      });

      describe('when classic sudo is not installed', () => {
        beforeEach(async () => {
          givenSudoWs(false);
          await startNone();
        });

        test('runs sudo -E preserving only HOME and MINIKUBE_HOME', () => {
          expect(findStartCommand()).toMatch(fallbackStart);
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
        if (cmd.includes("minikube' start")) callOrder.push('start');
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
