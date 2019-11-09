'use strict';

const isLinux = () => process.platform.toLowerCase().indexOf('linux') === 0;
const checkOperatingSystem = () => {
  if (!isLinux()) {
    throw Error('Unsupported OS, action only works in Linux');
  }
};

const checkEnvironment = () => {
  checkOperatingSystem();
};

module.exports = checkEnvironment;
