'use strict';

const fs = require('node:fs');
const {arch} = require('./arch');

const MIN_UBUNTU_MAJOR_VERSION = 18;
const OS_RELEASE = '/etc/os-release';

const isLinux = () => process.platform.toLowerCase().indexOf('linux') === 0;
// Parses os-release KEY=value lines (values optionally quoted)
const readOsRelease = () =>
  Object.fromEntries(
    fs
      .readFileSync(OS_RELEASE, 'utf8')
      .split('\n')
      .map(line =>
        line.trim().match(/^(?<key>[A-Z0-9_]+)=(?<q>["']?)(?<value>.*)\k<q>$/)
      )
      .filter(Boolean)
      .map(({groups: {key, value}}) => [key, value])
  );
const detectOperatingSystem = () => {
  if (!isLinux()) {
    return {supported: false, detected: process.platform};
  }
  if (!fs.existsSync(OS_RELEASE)) {
    return {supported: false, detected: `linux, no ${OS_RELEASE}`};
  }
  const {ID, VERSION_ID} = readOsRelease();
  return {
    supported:
      ID === 'ubuntu' && parseInt(VERSION_ID, 10) >= MIN_UBUNTU_MAJOR_VERSION,
    detected: `${ID || 'unknown'} ${VERSION_ID || 'unknown'}`
  };
};
const checkOperatingSystem = () => {
  const {supported, detected} = detectOperatingSystem();
  if (!supported) {
    throw new Error(
      `Unsupported OS, action only works in Ubuntu ${MIN_UBUNTU_MAJOR_VERSION}.04 or later (detected: ${detected})`
    );
  }
};

const checkEnvironment = () => {
  checkOperatingSystem();
  arch();
};

module.exports = checkEnvironment;
