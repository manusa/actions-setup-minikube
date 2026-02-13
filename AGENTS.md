# Setup Minikube GitHub Action - AI Agents Instructions

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

This file provides guidance to AI coding agents (GitHub Copilot, Claude Code, etc.) when working with code in this repository.

## Project Overview

A GitHub Action that sets up a single-node Kubernetes cluster using Minikube in CI workflows. It downloads and installs Minikube with specified versions of Kubernetes, supporting multiple drivers (`none`, `docker`) and container runtimes (`docker`, `cri-o`, `containerd`). Built with Node.js 20 using GitHub Actions toolkit libraries.

## Working Effectively

### Bootstrap and Setup
```shell
npm install
```

### Build Commands

This is a GitHub Action - no build step required. The action runs directly from `src/index.js`.

### Testing

**Unit tests (fast, ~2s):**
```shell
npm test
```

**Format check:**
```shell
npm run format-check
```

**IMPORTANT**: E2E tests run only in GitHub Actions workflows. They cannot be run locally as they require the GitHub Actions environment and actually provision Minikube clusters.

### Running the Application

This is a GitHub Action and cannot be run directly. Test locally by:
1. Running unit tests: `npm test`
2. Pushing to a branch and observing the CI workflow

## Architecture

### Technical Structure

```
src/
  index.js              # Entry point - orchestrates the setup process
  check-environment.js  # Validates Ubuntu version (18, 20, 22, 24)
  load-inputs.js        # Loads action inputs via @actions/core
  configure-environment.js # Prepares system (apt packages, Docker, CNI plugins)
  download.js           # Downloads binaries from GitHub releases (Minikube, CNI plugins, crictl, cri-dockerd)
  install.js            # Installs and starts Minikube
  exec.js               # Shell command execution utilities
  error-handler.js      # Global error handling
  __tests__/            # Jest unit tests (mirror src/ structure)

action.yml              # GitHub Action definition
.github/workflows/
  check.yml             # CI: format check + unit tests
  runner.yml            # E2E tests: runs action against multiple K8s versions
```

### Design Patterns

- **Modular pipeline**: `index.js` orchestrates discrete steps (check, load, configure, download, install)
- **GitHub Actions toolkit**: Uses `@actions/core` for inputs/outputs, `@actions/tool-cache` for downloads
- **GitHub API integration**: Uses Axios to fetch release information from GitHub API (supports authenticated requests via `github token` input)
- **Driver-specific logic**: Different setup paths for `none` vs `docker` drivers (none requires CNI plugins, crictl, cri-dockerd)

### Key Dependencies

- `@actions/core` - Action inputs, outputs, and logging
- `@actions/tool-cache` - Binary downloads and caching
- `@actions/io` - File system operations
- `axios` - HTTP requests to GitHub API

## Code Style

### Formatting

Prettier is configured via `.prettierrc.json`:
- Single quotes
- No trailing commas
- No bracket spacing (`{foo}` not `{ foo }`)
- 2-space indentation
- 80 character line width
- Arrow functions: avoid parentheses when possible (`x => x`)

**Format code:**
```shell
npm run format
```

### Pre-commit Hooks

Husky runs `npm run format` on pre-commit. The post-commit hook handles `node_modules` pruning for the committed action.

### Naming Conventions

- Use camelCase for variables and functions
- Module files use kebab-case (`check-environment.js`)
- Test files in `__tests__/` directory with `.test.js` suffix

## Testing Guidelines

### Running Tests
```shell
npm test
```

### Test Structure

Tests use Jest with extensive mocking. Each module has a corresponding test file in `src/__tests__/`.

**Current pattern in this codebase:**
- Tests use `jest.mock()` for external dependencies
- `beforeEach` resets modules and recreates mocks
- Tests follow Given/When/Then structure in comments

**Preferred testing approach for new tests:**

1. **Black-box Testing**: Test behavior and observable outcomes, not implementation details. Test the public API only.

2. **Avoid Mocks When Possible**: Use real implementations where feasible. Mocks should be a last resort for external services (GitHub API, file system in CI).

3. **Nested Test Structure**: Use nested `describe` blocks to organize scenarios:

```javascript
describe('UserService', () => {
  let service;
  beforeEach(() => {
    service = new UserService();
  });

  describe('createUser', () => {
    describe('with valid input', () => {
      let result;
      beforeEach(async () => {
        result = await service.createUser({ name: 'John', email: 'john@example.com' });
      });

      test('returns the created user', () => {
        expect(result.name).toBe('John');
      });

      test('assigns an id', () => {
        expect(result.id).toBeDefined();
      });
    });

    describe('with invalid email', () => {
      let error;
      beforeEach(async () => {
        try {
          await service.createUser({ name: 'John', email: 'invalid' });
        } catch (e) {
          error = e;
        }
      });

      test('throws an error', () => {
        expect(error).toBeInstanceOf(ValidationError);
      });
    });
  });
});
```

4. **Single Assertion Per Test**: Each test should assert ONE specific condition for clear failure identification.

5. **Scenario-Based Setup**: Define common scenarios in outer `beforeEach`, specific conditions in nested blocks.

## Common Tasks

### Adding Support for a New Kubernetes Version

1. Update E2E test matrix in `.github/workflows/runner.yml`
2. Test locally with `npm test`
3. Push and verify CI workflows pass

### Adding a New Action Input

1. Add input definition in `action.yml`
2. Load the input in `src/load-inputs.js` using `core.getInput()`
3. Use the input in relevant modules (`configure-environment.js`, `install.js`)
4. Add tests in `src/__tests__/load-inputs.test.js`

### Updating Dependencies

1. Update version in `package.json` or `src/*.js`
2. Run `npm install`
3. Test with `npm test` and `npm run format-check`
4. **Before committing**: Run `npm prune --omit=dev` to remove devDependencies
5. Commit changes including `node_modules/` (required for GitHub Actions - only production deps)

**Important**: GitHub Actions run directly from the repository, so `node_modules/` must be committed. However, only production dependencies should be included. Always prune devDependencies before committing.

### Releasing a New Version

1. Update version in `package.json`
2. Create release commit and tag
3. Husky post-commit hook handles `node_modules` pruning

## Troubleshooting

### Tests Fail with Module Not Found

Run `jest.resetModules()` in `beforeEach` to ensure clean module state between tests.

### Format Check Fails in CI

Run `npm run format` locally before committing. Husky pre-commit hook should handle this automatically.

### E2E Tests Fail

E2E tests in `runner.yml` require GitHub Actions environment. Check:
- Minikube version compatibility
- Kubernetes version compatibility
- Ubuntu version (only 18.04, 20.04, 22.04, 24.04 supported)

### Action Fails with "Unsupported OS"

The action only supports Ubuntu Linux. Check `src/check-environment.js` for supported versions.
