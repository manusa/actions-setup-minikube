'use strict';

const core = require('@actions/core');
const child_process = require('child_process');
const path = require('path');

const install = async (minikube, inputs) => {
  core.info('Installing Minikube');
  child_process.execSync(`chmod +x ${minikube}`);
  const minikubeDirectory = path.dirname(minikube);
  await io.mv(minikube, path.join(minikubeDirectory, 'minikube'));
  core.exportVariable('MINIKUBE_HOME', minikubeDirectory);
  core.addPath(minikubeDirectory);
  child_process.execSync(
    `
    sudo -E minikube start --vm-driver=none --kubernetes-version ${inputs.kubernetesVersion} \
    && sudo chmod -R a+r /home/runner/.kube /home/runner/.minikube:
    `,
    {
      stdio: 'inherit'
    }
  );
  const minikubeVersion = child_process
    .execSync(`minikube version`)
    .toString()
    .replace(/[\n\r]/g, '');
  console.log(`${minikubeVersion} installed successfully`);
};

module.exports = install;
