'use strict';

const core = require('@actions/core');
const execSync = require('./exec').execSync;
const {gitHubRequest} = require('./github');

const SUPPORTED = 'supported';
const UNSUPPORTED = 'unsupported';

const minikubeSupportedVersions = minikubeDirectory =>
  execSync(`${minikubeDirectory}/minikube config defaults kubernetes-version`)
    .toString()
    .split('\n')
    .map(v => v.replace('* ', '').trim())
    .filter(v => v.length > 0);

const kubernetesReleaseExists = async (version, githubToken) => {
  const response = await gitHubRequest({
    url: `https://api.github.com/repos/kubernetes/kubernetes/releases/tags/${version}`,
    githubToken,
    options: {validateStatus: status => status === 200 || status === 404}
  });
  return response.status === 200;
};

/**
 * Checks if the requested Kubernetes version can be used with Minikube.
 *
 * Three possible outcomes:
 * - SUPPORTED: version is in Minikube's built-in supported list.
 * - UNSUPPORTED: version is not in Minikube's list but exists as a
 *   published release in kubernetes/kubernetes. Minikube can still run it
 *   with the --force flag.
 * - Throws: version is not in Minikube's list and does not exist on GitHub.
 *
 * @param {string} minikubeDirectory - Path to the Minikube binary directory.
 * @param {object} inputs - Action inputs (kubernetesVersion, githubToken).
 * @returns {Promise<string>} SUPPORTED or UNSUPPORTED.
 */
const checkKubernetesVersion = async (minikubeDirectory, inputs) => {
  const supportedVersions = minikubeSupportedVersions(minikubeDirectory);
  if (supportedVersions.includes(inputs.kubernetesVersion)) {
    core.info(
      `Kubernetes version ${inputs.kubernetesVersion} is supported by Minikube`
    );
    return SUPPORTED;
  }
  core.warning(
    `Kubernetes version ${inputs.kubernetesVersion} is not in Minikube's supported list`
  );
  const exists = await kubernetesReleaseExists(
    inputs.kubernetesVersion,
    inputs.githubToken
  );
  if (!exists) {
    throw new Error(
      `Kubernetes version ${inputs.kubernetesVersion} was not found in the kubernetes/kubernetes GitHub releases.\nSupported Minikube versions:\n${supportedVersions.join('\n')}`
    );
  }
  return UNSUPPORTED;
};

module.exports = {checkKubernetesVersion, SUPPORTED, UNSUPPORTED};
