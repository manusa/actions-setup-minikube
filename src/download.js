'use strict';

const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const axios = require('axios');
const fs = require('fs');
const {logExecSync} = require('./exec');

const isLinux = name => name.indexOf('linux') >= 0;
const isAmd64 = name => name.indexOf('amd64') >= 0;
const isSignature = name => name.indexOf('sha1') >= 0 || name.indexOf('sha256') >= 0 || name.indexOf('sha512') >= 0;
const isWindows = name => name.indexOf('.win.') >= 0;
const isMac = name => name.indexOf('.darwin.') >= 0;
const isTgz = name => name.endsWith('.tgz');
const firstDir = dir => fs.readdirSync(dir, {withFileTypes: true}).filter(f => f.isDirectory()).map(f => f.name)[0];


const getTagInfo = async ({inputs, releaseUrl}) => {
  const headers = {};
  if (inputs.githubToken) {
    headers.Authorization = `token ${inputs.githubToken}`;
  }
  return axios({
    method: 'GET',
    url: releaseUrl,
    headers
  });
};

const downloadGitHubArtifact = async ({inputs, releaseUrl, assetPredicate}) => {
  const tagInfo = await getTagInfo({inputs, releaseUrl});
  const downloadUrl = tagInfo.data.assets.find(assetPredicate).browser_download_url;
  core.info(`Downloading from: ${downloadUrl}`);
  return tc.downloadTool(downloadUrl);
};

const downloadMinikube = async (inputs = {}) => {
  core.info(`Downloading Minikube  ${inputs.minikubeVersion}`);
  return downloadGitHubArtifact({
    inputs,
    releaseUrl: `https://api.github.com/repos/kubernetes/minikube/releases/tags/${inputs.minikubeVersion}`,
    assetPredicate: asset => isLinux(asset.name) && isAmd64(asset.name) && !isSignature(asset.name)
  });
};

// Required by cri-dockerd and recent Minikube releases
// https://github.com/Mirantis/cri-dockerd/commit/e2666520e25cb302b9b1d231a63699c2338b8567
// https://github.com/kubernetes/minikube/commit/fd549f396dbd39385baefe88dcead0ccf99f1bff
const installCniPlugins = async (inputs = {}) => {
  core.info(`Downloading CNI plugins`);
  const tag = 'v1.3.0';
  const tar = await downloadGitHubArtifact({
    inputs,
    releaseUrl: `https://api.github.com/repos/containernetworking/plugins/releases/tags/${tag}`,
    assetPredicate: asset =>
      isLinux(asset.name) && isAmd64(asset.name) && !isSignature(asset.name) && asset.name.indexOf('cni-plugins') === 0
  });
  const extractedTarDir = await tc.extractTar(tar);
  const cniBinDirPath = '/opt/cni/bin';
  logExecSync(`sudo find ${extractedTarDir} -type f -exec install -Dm 0755 "{}" -t "${cniBinDirPath}" \\;`);
};

const installCriCtl = async (inputs = {}) => {
  core.info(`Downloading cri-ctl`);
  const tag = 'v1.28.0';
  const tar = await downloadGitHubArtifact({
    inputs,
    releaseUrl: `https://api.github.com/repos/kubernetes-sigs/cri-tools/releases/tags/${tag}`,
    assetPredicate: asset =>
      isLinux(asset.name) && isAmd64(asset.name) && !isSignature(asset.name) && asset.name.indexOf('crictl') === 0
  });
  await tc.extractTar(tar, '/usr/local/bin');
}

const installCriDockerd = async (inputs = {}) => {
  core.info(`Downloading cri-dockerd`);
  // In case there are future releases, we can explore the usage of the latest release
  // const tagInfo = await getTagInfo({inputs, releaseUrl});
  // const tag = tagInfo.data.name;
  // const releaseUrl = 'https://api.github.com/repos/Mirantis/cri-dockerd/releases/latest';
  const tag = 'v0.3.4';
  const releaseUrl = `https://api.github.com/repos/Mirantis/cri-dockerd/releases/tags/${tag}`;
  const binaryTar = await downloadGitHubArtifact({
    inputs,
    releaseUrl,
    assetPredicate: asset =>
      !isSignature(asset.name) && !isWindows(asset.name) && !isMac(asset.name) && isAmd64(asset.name) && isTgz(asset.name) && asset.name.indexOf('cri-dockerd') === 0
  });
  // Binary
  const binaryDir = await tc.extractTar(binaryTar);
  const binaryContent = firstDir(binaryDir);
  logExecSync(`sudo install -m 0755 ${binaryDir}/${binaryContent}/cri-dockerd /usr/local/bin/`);
  logExecSync(`sudo ln -sf /usr/local/bin/cri-dockerd /usr/bin/cri-dockerd`);
  // Service file
  const sourceTar = await tc.downloadTool(`https://github.com/Mirantis/cri-dockerd/archive/refs/tags/${tag}.tar.gz`);
  const sourceDir = await tc.extractTar(sourceTar);
  const sourceContent = firstDir(sourceDir);
  logExecSync(`sudo cp -a ${sourceDir}/${sourceContent}/packaging/systemd/* /etc/systemd/system`);
  const serviceFile = '/etc/systemd/system/cri-docker.service';
  fs.writeFileSync(serviceFile, fs.readFileSync(serviceFile).toString()
    .replace(/cri-dockerd --/g, 'cri-dockerd --network-plugin=cni --')
  );
  // There's a soft link and shouldn't be needed
  fs.writeFileSync(serviceFile, fs.readFileSync(serviceFile).toString()
    .replace(/\/usr\/bin\/cri-dockerd/g, '/usr/local/bin/cri-dockerd')
  );
  const socketFile = '/etc/systemd/system/cri-docker.socket';
  fs.writeFileSync(socketFile, fs.readFileSync(socketFile).toString()
    .replace(/cri-docker.sock/g, 'cri-dockerd.sock')
  );
  logExecSync('sudo systemctl daemon-reload');
  logExecSync('sudo systemctl enable cri-docker.service');
  logExecSync('sudo systemctl enable --now cri-docker.socket');
};

module.exports = {downloadMinikube, installCniPlugins, installCriCtl, installCriDockerd};
