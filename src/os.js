'use strict';

const fs = require('fs');

const isLinux = () => process.platform.toLowerCase().indexOf('linux') === 0;
const isUbuntu = () => {
  const osRelease = '/etc/os-release';
  const osInfo = fs.existsSync(osRelease) && fs.readFileSync(osRelease);
  return (
    osInfo &&
    osInfo.indexOf('NAME="Ubuntu"') >= 0 &&
    osInfo.indexOf('VERSION="18') >= 0
  );
};
const isValidLinux = () => isLinux() && isUbuntu();
const isWindows = () => process.platform.toLowerCase().indexOf('win') === 0;

module.exports = {
  isLinux,
  isUbuntu,
  isValidLinux,
  isWindows
};
