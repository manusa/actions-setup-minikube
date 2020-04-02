'use strict';

const core = require('@actions/core');
const axios = require('axios');
const tc = require('@actions/tool-cache');
const {isLinux, isWindows} = require('./os');

const download = async inputs => {
  core.info(`Downloading Minikube  ${inputs.minikubeVersion}`);
  const tagInfoUrl = `https://api.github.com/repos/kubernetes/minikube/releases/tags/${inputs.minikubeVersion}`;
  const headers = {};
  if (inputs.githubToken) {
    headers.Authorization = `token ${inputs.githubToken}`
  }
  const tagInfo = await axios({
    method: 'GET',
    url: tagInfoUrl,
    headers
  });
  let filter;
  if (isLinux()) {
    filter = asset =>
      asset.name.indexOf('linux') >= 0 && asset.name.indexOf('sha256') < 0;
  } else if (isWindows()) {
    filter = asset =>
      asset.name.indexOf('windows') >= 0 && asset.name.indexOf('sha256') < 0;
  }
  const downloadUrl = tagInfo.data.assets.find(filter).browser_download_url;
  core.info(`Minikube version found at: ${downloadUrl}`);
  return tc.downloadTool(downloadUrl);
};

module.exports = download;
