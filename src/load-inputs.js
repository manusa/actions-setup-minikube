'use strict';

const core = require('@actions/core');

const loadInputs = () => {
  core.info('Loading input variables');
  const result = {};
  result.minikubeVersion = core.getInput('minikube version', {required: true});
  result.kubernetesVersion = core.getInput('kubernetes version', {
    required: true
  });
  return result;
};

module.exports = loadInputs;
