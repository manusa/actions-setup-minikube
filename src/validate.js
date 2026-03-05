'use strict';

const core = require('@actions/core');
const execSync = require('./exec').execSync;

const validate = (minikubeDirectory, inputs) => {
  const supportedVersions = execSync(
    `${minikubeDirectory}/minikube config defaults kubernetes-version`
  ).toString();
  if (!supportedVersions.includes(inputs.kubernetesVersion)) {
    throw new Error(
      `Kubernetes version ${inputs.kubernetesVersion} is not supported by this version of Minikube.\nSupported versions:\n${supportedVersions}`
    );
  }
  core.info(
    `Kubernetes version ${inputs.kubernetesVersion} is supported by this version of Minikube`
  );
};

module.exports = validate;
