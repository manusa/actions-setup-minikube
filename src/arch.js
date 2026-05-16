'use strict';

const arch = () => {
  switch (process.arch) {
    case 'x64':
      return 'amd64';
    case 'arm64':
      return 'arm64';
    default:
      throw new Error(
        `Unsupported architecture: ${process.arch}. Action only works on x64 (amd64) or arm64 runners.`
      );
  }
};

module.exports = {arch};
