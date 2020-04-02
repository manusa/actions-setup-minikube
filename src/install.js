'use strict';

const core = require('@actions/core');
const {isLinux, isWindows} = require('./os');
const execSync = require('./exec').execSync;
const logExecSync = require('./exec').logExecSync;
const path = require('path');
const io = require('@actions/io');

const installLinux =  async (minikube, inputs) => {
  logExecSync(`chmod +x ${minikube}`);
  const minikubeDirectory = path.dirname(minikube);
  await io.mv(minikube, path.join(minikubeDirectory, 'minikube'));
  core.exportVariable('MINIKUBE_HOME', minikubeDirectory);
  core.addPath(minikubeDirectory);
  logExecSync(
    `sudo -E ${minikubeDirectory}/minikube start --vm-driver=none --kubernetes-version ${inputs.kubernetesVersion}`
  );
  logExecSync(`sudo chown -R $USER $HOME/.kube ${minikubeDirectory}/.minikube`);
  logExecSync(
    `sudo chmod -R a+r /home/runner/.kube ${minikubeDirectory}/.minikube`
  );
};

const installWindows =  async (minikube, inputs) => {
  const minikubeDirectory = path.dirname(minikube);
  const minikubeExeFile = path.join(minikubeDirectory, 'minikube.exe');
  await io.mv(minikube, minikubeExeFile);
  logExecSync(
    `${minikubeExeFile} start --kubernetes-version ${inputs.kubernetesVersion}`
  );
};

const install = async (minikube, inputs) => {
  core.info('Installing Minikube');
  if (isLinux()) {
    await installLinux(minikube, inputs);
  } else if (isWindows()) {
    await installWindows(minikube, inputs);
  }
  const minikubeVersion = execSync(`minikube version`)
    .toString()
    .replace(/[\n\r]/g, '');
  core.info(`${minikubeVersion} installed successfully`);
};

module.exports = install;
