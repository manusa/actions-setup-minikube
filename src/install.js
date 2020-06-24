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
  await io.mv(minikube, path.join(minikubeDirectory, 'minikube'));
  core.exportVariable('MINIKUBE_HOME', minikubeDirectory);
  core.addPath(minikubeDirectory);
  logExecSync(
    `${sudo(inputs)} ${minikubeDirectory}/minikube start --vm-driver=${driver(
      inputs
    )} --kubernetes-version ${inputs.kubernetesVersion}`
  );
  logExecSync(`sudo chown -R $USER $HOME/.kube ${minikubeDirectory}/.minikube`);
  logExecSync(
    `sudo chmod -R a+r /home/runner/.kube ${minikubeDirectory}/.minikube`
  );
  const minikubeVersion = execSync(`minikube version`)
    .toString()
    .replace(/[\n\r]/g, '');
  core.info(`${minikubeVersion} installed successfully`);
};

module.exports = install;
