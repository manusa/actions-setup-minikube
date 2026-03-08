'use strict';

describe('github module test suite', () => {
  let axios;
  let github;
  beforeEach(() => {
    jest.resetModules();
    jest.mock('axios');
    axios = require('axios');
    github = require('../github');
  });
  describe('gitHubRequest', () => {
    describe('with github token', () => {
      test('should set Authorization header', async () => {
        // Given
        axios.mockResolvedValue({status: 200});
        // When
        await github.gitHubRequest({
          url: 'https://api.github.com/repos/o/r/releases/tags/v1',
          githubToken: 'secret-token'
        });
        // Then
        expect(axios).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: {Authorization: 'token secret-token'}
          })
        );
      });
    });
    describe('without github token', () => {
      test('should not set Authorization header', async () => {
        // Given
        axios.mockResolvedValue({status: 200});
        // When
        await github.gitHubRequest({
          url: 'https://api.github.com/repos/o/r/releases/tags/v1'
        });
        // Then
        expect(axios).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: {}
          })
        );
      });
    });
    describe('with additional options', () => {
      test('should pass options to axios', async () => {
        // Given
        axios.mockResolvedValue({status: 200});
        const validateStatus = s => s === 200;
        // When
        await github.gitHubRequest({
          url: 'https://api.github.com/test',
          githubToken: 'token',
          options: {validateStatus}
        });
        // Then
        expect(axios).toHaveBeenCalledWith(
          expect.objectContaining({validateStatus})
        );
      });
    });
  });
});
