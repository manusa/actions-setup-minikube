'use strict';

const core = require('@actions/core');
const execSync = require('./exec').execSync;
const logExecSync = require('./exec').logExecSync;
const {shellQuote} = require('./shell-quote');
const fs = require('node:fs');
const path = require('node:path');
const io = require('@actions/io');
const {
  checkKubernetesVersion,
  UNSUPPORTED
} = require('./check-kubernetes-version');

const CLASSIC_SUDO = '/usr/bin/sudo.ws';

const driver = inputs => inputs.driver || 'none';
const isClassicSudoUsable = () => {
  if (!fs.existsSync(CLASSIC_SUDO)) {
    return false;
  }
  try {
    execSync(`${CLASSIC_SUDO} -n -E true 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
};
// minikube start must inherit the runner's environment (at least HOME and
// MINIKUBE_HOME, so its config lands in the runner's home, not /root).
// sudo-rs (Ubuntu's default sudo since 25.10) ignores -E, but those releases
// still ship classic sudo as sudo.ws, which is used whenever it works.
// Otherwise the default sudo gets -E plus an explicit HOME and MINIKUBE_HOME:
// classic sudo (Ubuntu 25.04 and older) forwards the whole environment as
// before, while sudo-rs forwards only those two variables. Keep that list to
// non-secret values: classic sudo logs explicitly preserved values to syslog.
const sudo = inputs => {
  if (inputs.driver === 'docker') {
    return '';
  }
  if (isClassicSudoUsable()) {
    return `${CLASSIC_SUDO} -E`;
  }
  return 'sudo -E --preserve-env=HOME,MINIKUBE_HOME';
};

const install = async (minikube, inputs) => {
  core.info('Installing Minikube');
  logExecSync(`chmod +x ${shellQuote(minikube)}`);
  const minikubeDirectory = path.dirname(minikube);
  // See https://github.com/kubernetes/minikube/pull/18648
  // https://github.com/kubernetes/minikube/issues/15835
  // Since v1.34.0 minikube doesn't automatically append .minikube to the MINIKUBE_HOME variable unless the directory exists
  // By creating it manually we ensure compatibility with current and legacy versions.
  await io.mkdirP(path.join(minikubeDirectory, '.minikube'));
  await io.mv(minikube, path.join(minikubeDirectory, 'minikube'));
  core.exportVariable('MINIKUBE_HOME', minikubeDirectory);
  core.addPath(minikubeDirectory);
  const versionStatus = await checkKubernetesVersion(minikubeDirectory, inputs);
  const containerRuntime = inputs.containerRuntime
    ? `--container-runtime=${inputs.containerRuntime}`
    : '';
  // When the K8s version is not in Minikube's supported list (but exists on
  // GitHub), --force is needed to bypass Minikube's unauthenticated GitHub
  // API version check which can trigger rate-limit errors in CI.
  // See https://github.com/manusa/actions-setup-minikube/issues/141
  const force = versionStatus === UNSUPPORTED ? '--force' : '';
  if (force) {
    core.warning(
      `Adding --force flag to minikube start because Kubernetes version ${inputs.kubernetesVersion} is not in Minikube's default supported list`
    );
    core.setOutput('force', 'true');
  }
  const minikubeHome = shellQuote(`${minikubeDirectory}/.minikube`);
  const startCommand = [
    sudo(inputs),
    `${shellQuote(`${minikubeDirectory}/minikube`)} start`,
    // driver, container runtime and start args are user inputs appended as-is:
    // existing workflows may rely on the shell evaluating them (word
    // splitting, quotes, $VAR expansion), so they must not be quoted
    `--vm-driver=${driver(inputs)}`,
    containerRuntime,
    // Validated against minikube's list or a kubernetes/kubernetes release
    // tag, so any working value is a plain version and quoting is a no-op
    `--kubernetes-version ${shellQuote(inputs.kubernetesVersion)}`,
    force,
    inputs.startArgs
  ]
    .filter(Boolean)
    .join(' ');
  logExecSync(startCommand);
  logExecSync(`sudo chown -R $USER "$HOME/.kube" ${minikubeHome}`);
  logExecSync(`sudo chmod -R a+r "$HOME/.kube" ${minikubeHome}`);
  logExecSync(`sudo find ${minikubeHome} -name id_rsa -exec chmod 600 {} \\;`);
  const minikubeVersion = execSync(`minikube version`)
    .toString()
    .replace(/[\n\r]/g, '');
  core.info(`${minikubeVersion} installed successfully`);
};

module.exports = install;
