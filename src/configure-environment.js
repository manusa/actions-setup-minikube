'use strict';

const core = require('@actions/core');
const child_process = require('child_process');

const configureEnvironment = () => {
  core.info('Updating Docker configuration to support Minikube');
  child_process.execSync(
    `sudo apt-get update && sudo apt-get install qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils`,
    {
      stdio: 'inherit'
    }
  );
};

module.exports = configureEnvironment;
