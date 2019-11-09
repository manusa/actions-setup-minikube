'use strict';

const core = require('@actions/core');
const execSync = require('./exec-sync');

const configureEnvironment = () => {
  core.info('Updating Environment configuration to support Minikube');
  execSync('sudo apt-get purge docker docker-engine docker.io containerd runc');
  execSync('sudo rm -rf /var/lib/docker');
  execSync(
    'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -'
  );
  execSync(`
    sudo add-apt-repository \
        "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
        $(lsb_release -cs) \
        stable"
  `);
  execSync('sudo apt-get update');
  execSync('sudo apt-get install docker-ce docker-ce-cli');
};

module.exports = configureEnvironment;
