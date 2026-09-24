'use strict';

const {execSync} = require('node:child_process');

describe('shellQuote', () => {
  let shellQuote;

  beforeEach(() => {
    jest.resetModules();
    shellQuote = require('../shell-quote').shellQuote;
  });

  describe.each([
    ['a plain path', '/home/runner/work/_temp/minikube'],
    ['a path with spaces', '/home/runner/actions runner/_temp/minikube'],
    ['a single quote', "/tmp/it's/minikube"],
    ['a double quote', '/tmp/say "hi"/minikube'],
    ['a dollar sign', '/tmp/$HOME/minikube'],
    ['a backtick', '/tmp/`id`/minikube'],
    ['a glob', '/tmp/*/minikube'],
    ['a semicolon', '/tmp/a;b/minikube'],
    ['an empty string', '']
  ])('with %s', (_, value) => {
    test('is passed through the shell unchanged', () => {
      const output = execSync(`printf '%s' ${shellQuote(value)}`);
      expect(output.toString()).toBe(value);
    });
  });
});
