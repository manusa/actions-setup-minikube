'use strict';

const axios = require('axios');

const gitHubRequest = async ({url, githubToken, options = {}}) => {
  const headers = {};
  if (githubToken) {
    headers.Authorization = `token ${githubToken}`;
  }
  return axios({method: 'GET', url, headers, ...options});
};

module.exports = {gitHubRequest};
