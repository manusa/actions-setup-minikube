'use strict';

const core = require('@actions/core');
const execSync = require('./exec').execSync;
const logExecSync = require('./exec').logExecSync;
const path = require('path');
const io = require('@actions/io');

const driver = inputs => inputs.driver || 'none';
const sudo = inputs => {
  if (inputs.driver === 'docker') {
    return '';
  }
  return 'sudo -E';
};

const install = async (minikube, inputs) => {
  core.info('Installing Minikube');
  logExecSync(`chmod +x ${minikube}`);
  const minikubeDirectory = path.dirname(minikube);
  // See https://github.com/kubernetes/minikube/pull/18648
  // https://github.com/kubernetes/minikube/issues/15835
  // Since v1.34.0 minikube doesn't automatically append .minikube to the MINIKUBE_HOME variable unless the directory exists
  // By creating it manually we ensure compatibility with current and legacy versions.
  await io.mkdirP(path.join(minikubeDirectory, '.minikube'));
  await io.mv(minikube, path.join(minikubeDirectory, 'minikube'));
  core.exportVariable('MINIKUBE_HOME', minikubeDirectory);
  core.addPath(minikubeDirectory);
  const containerRuntime = inputs.containerRuntime ? `--container-runtime=${inputs.containerRuntime}` : ''
  logExecSync(
    `${sudo(inputs)} ${minikubeDirectory}/minikube start --vm-driver=${driver(
      inputs
    )} ${containerRuntime} --kubernetes-version ${inputs.kubernetesVersion} ${inputs.startArgs}`
  );
  logExecSync(`sudo chown -R $USER $HOME/.kube ${minikubeDirectory}/.minikube`);
  logExecSync(
    `sudo chmod -R a+r $HOME/.kube ${minikubeDirectory}/.minikube`
  );
  logExecSync(
    `sudo find ${minikubeDirectory}/.minikube -name id_rsa -exec chmod 600 {} \\;`
  );
  const minikubeVersion = execSync(`minikube version`)
    .toString()
    .replace(/[\n\r]/g, '');
  core.info(`${minikubeVersion} installed successfully`);
};

module.exports = install;
