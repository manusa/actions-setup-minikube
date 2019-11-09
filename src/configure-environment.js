'use strict';

const core = require('@actions/core');
const child_process = require('child_process');

const configureEnvironment = () => {
  core.info('Updating Environment configuration to support Minikube');
  child_process.execSync(
    `
    apt-get purge docker docker-engine docker.io containerd runc \
    && sudo rm -rf /var/lib/docker \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add - \
    && sudo add-apt-repository \
        "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
        $(lsb_release -cs) \
        stable" \
    && sudo apt-get update \
    && sudo apt-get install docker-ce docker-ce-cli
    `,
    {
      stdio: 'inherit'
    }
  );
};

module.exports = configureEnvironment;
