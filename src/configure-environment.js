'use strict';

const core = require('@actions/core');
const logExecSync = require('./exec').logExecSync;

const configureEnvironment = () => {
  core.info('Updating Environment configuration to support Minikube');
  logExecSync('sudo apt-get purge docker docker-engine docker.io containerd runc');
  logExecSync('sudo rm -rf /var/lib/docker');
  logExecSync(
    'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -'
  );
  logExecSync(`
    sudo add-apt-repository \
        "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
        $(lsb_release -cs) \
        stable"
  `);
  logExecSync('sudo apt-get update');
  logExecSync('sudo apt-get install docker-ce docker-ce-cli');
};

module.exports = configureEnvironment;
