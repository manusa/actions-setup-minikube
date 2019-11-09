'use strict';

const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const child_process = require('child_process');
const path = require('path');
const fs = require('fs');

const install = async (minikube, inputs) => {
  core.info('Installing Minikube');
  child_process.execSync(`chmod +x ${minikube}`);
  const minikubeDirectory = path.dirname(minikube);
  core.exportVariable('MINIKUBE_HOME', minikubePath);
  core.addPath(minikubeDirectory);
  child_process.execSync(
    `minikube start --vm-driver=none --kubernetes-version ${inputs.kubernetesVersion}`,
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
