'use strict';

const core = require('@actions/core');
const axios = require('axios');
const tc = require('@actions/tool-cache');

const isLinux = name => name.indexOf('linux') >= 0;
const isAmd64 = name => name.indexOf('amd64') >= 0;
const isSignature = name => name.indexOf('sha256') >= 0;

const download = async inputs => {
  core.info(`Downloading Minikube  ${inputs.minikubeVersion}`);
  const tagInfoUrl = `https://api.github.com/repos/kubernetes/minikube/releases/tags/${inputs.minikubeVersion}`;
  const headers = {};
  if (inputs.githubToken) {
    headers.Authorization = `token ${inputs.githubToken}`;
  }
  const tagInfo = await axios({
    method: 'GET',
    url: tagInfoUrl,
    headers
  });
  const downloadUrl = tagInfo.data.assets.find(
    asset => isLinux(asset.name) && isAmd64(asset.name) && !isSignature(asset.name)
  ).browser_download_url;
  core.info(`Minikube version found at: ${downloadUrl}`);
  return tc.downloadTool(downloadUrl);
};

module.exports = download;
