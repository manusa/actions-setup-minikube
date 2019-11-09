'use strict';

const core = require('@actions/core');
const execSync = require('./exec-sync');
const path = require('path');
const io = require('@actions/io');

const install = async (minikube, inputs) => {
  core.info('Installing Minikube');
  execSync(`chmod +x ${minikube}`);
  const minikubeDirectory = path.dirname(minikube);
  await io.mv(minikube, path.join(minikubeDirectory, 'minikube'));
  core.exportVariable('MINIKUBE_HOME', minikubeDirectory);
  core.addPath(minikubeDirectory);
  execSync(
    `sudo -E ${minikubeDirectory}/minikube start --vm-driver=none --kubernetes-version ${inputs.kubernetesVersion}`
  );
  execSync(`sudo chmod -R a+r /home/runner/.kube`);
  const minikubeVersion = execSync(`minikube version`)
    .toString()
    .replace(/[\n\r]/g, '');
  console.log(`${minikubeVersion} installed successfully`);
};

module.exports = install;
