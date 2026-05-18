'use strict';

const crypto = require('node:crypto');

const sha256Hex = buffer =>
  crypto.createHash('sha256').update(buffer).digest('hex');

module.exports = {sha256Hex};
