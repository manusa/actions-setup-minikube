'use strict';

const {isValidLinux, isWindows} = require('./os');

const checkOperatingSystem = () => {
  if (!isValidLinux() && !isWindows()) {
    throw Error('Unsupported OS, action only works in Ubuntu 18 or Windows');
  }
};

const checkEnvironment = () => {
  checkOperatingSystem();
};

module.exports = checkEnvironment;
