'use strict';

const core = require('@actions/core');
// const child_process = require('child_process');

const configureDocker = () => {
  core.info('Updating Docker configuration to support Minikube');
};

module.exports = configureDocker;
