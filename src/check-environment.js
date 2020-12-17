'use strict';

const fs = require('fs');

const isLinux = () => process.platform.toLowerCase().indexOf('linux') === 0;
const isUbuntu = version => {
  const osRelease = '/etc/os-release';
  const osInfo = fs.existsSync(osRelease) && fs.readFileSync(osRelease);
  return (
    osInfo &&
    osInfo.indexOf('NAME="Ubuntu"') >= 0 &&
    osInfo.indexOf(`VERSION="${version}`) >= 0
  );
};
const isUbuntu18 = () => isUbuntu('18');
const isUbuntu20 = () => isUbuntu('20');
const isValidLinux = () => isLinux() && (isUbuntu18() || isUbuntu20());
const checkOperatingSystem = () => {
  if (!isValidLinux()) {
    throw Error('Unsupported OS, action only works in Ubuntu 18 or 20');
  }
};

const checkEnvironment = () => {
  checkOperatingSystem();
};

module.exports = checkEnvironment;
