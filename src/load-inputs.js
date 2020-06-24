'use strict';

const core = require('@actions/core');

const loadInputs = () => {
  core.info('Loading input variables');
  const result = {};
  result.minikubeVersion = core.getInput('minikube version', {required: true});
  result.kubernetesVersion = core.getInput('kubernetes version', {
    required: true
  });
  result.githubToken = core.getInput('github token');
  result.driver = core.getInput('driver');
  return result;
};

module.exports = loadInputs;
