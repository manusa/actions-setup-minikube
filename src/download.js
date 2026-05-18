'use strict';

const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const crypto = require('node:crypto');
const fs = require('node:fs');
const {logExecSync} = require('./exec');
const {gitHubRequest, apiBaseUrl, serverBaseUrl} = require('./github');
const {arch} = require('./arch');
const checksums = require('./checksums');

const isLinux = name => name.indexOf('linux') >= 0;
const isArch = name => name.indexOf(arch()) >= 0;
const isSignature = name =>
  name.indexOf('sha1') >= 0 ||
  name.indexOf('sha256') >= 0 ||
  name.indexOf('sha512') >= 0;
const isWindows = name => name.indexOf('.win.') >= 0;
const isMac = name => name.indexOf('.darwin.') >= 0;
const isTgz = name => name.endsWith('.tgz');
const firstDir = dir =>
  fs
    .readdirSync(dir, {withFileTypes: true})
    .filter(f => f.isDirectory())
    .map(f => f.name)[0];

const assertSha256Hex = (hex, label) => {
  // Lowercase only: crypto.digest('hex') and `sha256sum` both emit lowercase,
  // so an uppercase value would assert OK and then silently fail the equality
  // check downstream. Reject it here with an actionable message instead.
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(
      `Invalid SHA256 digest for ${label}: expected 64 lowercase hex chars, got ${JSON.stringify(hex)}`
    );
  }
};

const verifySha256File = async (filePath, expectedHex, label) => {
  assertSha256Hex(expectedHex, label);
  const actual = crypto
    .createHash('sha256')
    .update(await fs.promises.readFile(filePath))
    .digest('hex');
  if (actual !== expectedHex) {
    throw new Error(
      `SHA256 mismatch for ${label}: expected ${expectedHex}, got ${actual}`
    );
  }
};

const fetchCompanionSha256 = async ({asset, assets, inputs}) => {
  const digestAsset = assets.find(a => a.name === `${asset.name}.sha256`);
  if (!digestAsset) {
    throw new Error(
      `No .sha256 companion asset published for ${asset.name}. Refusing to install an unverified binary.`
    );
  }
  // `responseType: 'text'` defends against axios JSON auto-decoding the
  // checksum body if a future GitHub change ever sets application/json on it.
  const response = await gitHubRequest({
    url: digestAsset.browser_download_url,
    githubToken: inputs.githubToken,
    options: {responseType: 'text'}
  });
  const parsed = String(response.data).trim().split(/\s+/)[0];
  assertSha256Hex(parsed, `${asset.name}.sha256 response body`);
  return parsed;
};

const downloadGitHubArtifact = async ({
  inputs,
  releaseUrl,
  assetPredicate,
  verifyWithCompanionSha256 = false,
  expectedSha256
}) => {
  if (verifyWithCompanionSha256 && expectedSha256) {
    throw new Error(
      'downloadGitHubArtifact: both `verifyWithCompanionSha256` and `expectedSha256` were provided; pick exactly one.'
    );
  }
  if (!verifyWithCompanionSha256 && !expectedSha256) {
    throw new Error(
      'downloadGitHubArtifact: neither `verifyWithCompanionSha256` nor `expectedSha256` was provided; one is required to verify the download.'
    );
  }
  const tagInfo = await gitHubRequest({
    url: releaseUrl,
    githubToken: inputs.githubToken
  });
  const asset = tagInfo.data.assets.find(assetPredicate);
  if (!asset) {
    throw new Error(
      `No matching ${arch()} asset found at ${releaseUrl}. The release may not publish ${arch()} binaries.`
    );
  }
  core.info(`Downloading from: ${asset.browser_download_url}`);
  const downloadedFile = await tc.downloadTool(asset.browser_download_url);
  if (verifyWithCompanionSha256) {
    const expected = await fetchCompanionSha256({
      asset,
      assets: tagInfo.data.assets,
      inputs
    });
    await verifySha256File(downloadedFile, expected, asset.name);
  } else {
    await verifySha256File(downloadedFile, expectedSha256, asset.name);
  }
  return downloadedFile;
};

// Paired download + verify for URLs that aren't release assets (e.g. GitHub
// auto-generated source archives). Keeps verification inseparable from the
// download so a future contributor can't add a bare tc.downloadTool call.
const downloadVerifiedUrl = async ({url, expectedSha256, label}) => {
  core.info(`Downloading from: ${url}`);
  const downloadedFile = await tc.downloadTool(url);
  await verifySha256File(downloadedFile, expectedSha256, label);
  return downloadedFile;
};

const downloadMinikube = async (inputs = {}) => {
  core.info(`Downloading Minikube  ${inputs.minikubeVersion}`);
  return downloadGitHubArtifact({
    inputs,
    releaseUrl: `${apiBaseUrl}/repos/kubernetes/minikube/releases/tags/${inputs.minikubeVersion}`,
    assetPredicate: asset =>
      isLinux(asset.name) && isArch(asset.name) && !isSignature(asset.name),
    verifyWithCompanionSha256: true
  });
};

// Required by cri-dockerd and recent Minikube releases
// https://github.com/Mirantis/cri-dockerd/commit/e2666520e25cb302b9b1d231a63699c2338b8567
// https://github.com/kubernetes/minikube/commit/fd549f396dbd39385baefe88dcead0ccf99f1bff
const installCniPlugins = async (inputs = {}) => {
  core.info(`Downloading CNI plugins`);
  const tag = 'v1.9.0';
  const tar = await downloadGitHubArtifact({
    inputs,
    releaseUrl: `${apiBaseUrl}/repos/containernetworking/plugins/releases/tags/${tag}`,
    assetPredicate: asset =>
      isLinux(asset.name) &&
      isArch(asset.name) &&
      !isSignature(asset.name) &&
      asset.name.indexOf('cni-plugins') === 0,
    verifyWithCompanionSha256: true
  });
  const extractedTarDir = await tc.extractTar(tar);
  const cniBinDirPath = '/opt/cni/bin';
  logExecSync(
    `sudo find ${extractedTarDir} -type f -exec install -Dm 0755 "{}" -t "${cniBinDirPath}" \\;`
  );
};

const installCriCtl = async (inputs = {}) => {
  core.info(`Downloading cri-ctl`);
  const tag = 'v1.35.0';
  const tar = await downloadGitHubArtifact({
    inputs,
    releaseUrl: `${apiBaseUrl}/repos/kubernetes-sigs/cri-tools/releases/tags/${tag}`,
    assetPredicate: asset =>
      isLinux(asset.name) &&
      isArch(asset.name) &&
      !isSignature(asset.name) &&
      asset.name.indexOf('crictl') === 0,
    verifyWithCompanionSha256: true
  });
  await tc.extractTar(tar, '/usr/local/bin');
};

const installCriDockerd = async (inputs = {}) => {
  core.info(`Downloading cri-dockerd`);
  // Pinned digests live in ./checksums.js because cri-dockerd does not publish
  // .sha256 companion assets for its .tgz or source archives.
  const {tag, binarySha256, sourceSha256} = checksums.criDockerd;
  const expectedBinarySha256 = binarySha256[arch()];
  if (!expectedBinarySha256) {
    throw new Error(
      `No pinned SHA256 for arch=${arch()} in checksums.criDockerd.binarySha256. Update src/checksums.js when adding a new arch.`
    );
  }
  const releaseUrl = `${apiBaseUrl}/repos/Mirantis/cri-dockerd/releases/tags/${tag}`;
  const binaryTar = await downloadGitHubArtifact({
    inputs,
    releaseUrl,
    assetPredicate: asset =>
      !isSignature(asset.name) &&
      !isWindows(asset.name) &&
      !isMac(asset.name) &&
      isArch(asset.name) &&
      isTgz(asset.name) &&
      asset.name.indexOf('cri-dockerd') === 0,
    expectedSha256: expectedBinarySha256
  });
  // Binary
  const binaryDir = await tc.extractTar(binaryTar);
  const binaryContent = firstDir(binaryDir);
  logExecSync(
    `sudo install -m 0755 ${binaryDir}/${binaryContent}/cri-dockerd /usr/local/bin/`
  );
  logExecSync(`sudo ln -sf /usr/local/bin/cri-dockerd /usr/bin/cri-dockerd`);
  // Service file
  const sourceTar = await downloadVerifiedUrl({
    url: `${serverBaseUrl}/Mirantis/cri-dockerd/archive/refs/tags/${tag}.tar.gz`,
    expectedSha256: sourceSha256,
    label: 'cri-dockerd source archive'
  });
  const sourceDir = await tc.extractTar(sourceTar);
  const sourceContent = firstDir(sourceDir);
  logExecSync(
    `sudo cp -a ${sourceDir}/${sourceContent}/packaging/systemd/* /etc/systemd/system`
  );
  const serviceFile = '/etc/systemd/system/cri-docker.service';
  fs.writeFileSync(
    serviceFile,
    fs
      .readFileSync(serviceFile)
      .toString()
      .replace(/cri-dockerd --/g, 'cri-dockerd --network-plugin=cni --')
  );
  // There's a soft link and shouldn't be needed
  fs.writeFileSync(
    serviceFile,
    fs
      .readFileSync(serviceFile)
      .toString()
      .replace(/\/usr\/bin\/cri-dockerd/g, '/usr/local/bin/cri-dockerd')
  );
  const socketFile = '/etc/systemd/system/cri-docker.socket';
  fs.writeFileSync(
    socketFile,
    fs
      .readFileSync(socketFile)
      .toString()
      .replace(/cri-docker.sock/g, 'cri-dockerd.sock')
  );
  logExecSync('sudo systemctl daemon-reload');
  logExecSync('sudo systemctl enable cri-docker.service');
  logExecSync('sudo systemctl enable --now cri-docker.socket');
};

module.exports = {
  downloadMinikube,
  installCniPlugins,
  installCriCtl,
  installCriDockerd,
  /** @internal — exposed for testing the verification funnel. */
  downloadGitHubArtifact,
  /** @internal — exposed for testing the verification funnel. */
  verifySha256File
};
