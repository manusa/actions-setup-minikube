'use strict';

const core = require('@actions/core');
const logExecSync = require('./exec').logExecSync;

const configureEnvironment = () => {
  core.info('Updating Environment configuration to support Minikube');
  logExecSync('sudo apt-get update');
  logExecSync('sudo apt-get install -y conntrack');
};

module.exports = configureEnvironment;
