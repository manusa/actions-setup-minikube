# Testing

## Overview

Tests follow a behavioral, black-box approach. Each source module has a corresponding test file in `src/__tests__/` with `.test.js` suffix. Tests run locally via `npm test`.

The goal is to test **observable behavior** (return values, thrown errors, HTTP requests made, side effects produced) rather than **implementation details** (which internal functions were called, in what order, with what arguments). This makes tests resilient to refactoring — the implementation can change freely as long as behavior is preserved.

## Test Framework

Jest with ES Modules support. Tests use `import`/`export` and `await import()` for dynamic imports.

## Principles

### Black-Box Testing

Test the public API of each module. Don't test internal helper functions, don't assert on call order between internal modules, don't verify intermediate state.

```javascript
// Good: test observable outcome
test('throws for non-existent Kubernetes version', async () => {
  await expect(checkKubernetesVersion(dir, inputs)).rejects.toThrow(
    /not found/
  );
});

// Bad: test implementation detail
test('calls gitHubRequest with correct URL', async () => {
  expect(github.gitHubRequest).toHaveBeenCalledWith(
    expect.objectContaining({url: '...'})
  );
});
```

### Minimal Mocks

Mocks are only used at **system boundaries** — points where the code interacts with external systems that cannot run in a test environment:

| Boundary                 | Why Mock                                                          |
| ------------------------ | ----------------------------------------------------------------- |
| `child_process.execSync` | Executes arbitrary shell commands (`apt-get`, `sudo`, `minikube`) |
| `@actions/tool-cache`    | Downloads binaries from the internet                              |
| `@actions/core`          | Interacts with GitHub Actions runtime (inputs, outputs, logging)  |
| `@actions/io`            | File system operations requiring elevated privileges              |
| `fs` (selective)         | Only when reading hardcoded system paths like `/etc/os-release`   |

HTTP requests to GitHub API are **not mocked** — they go through a local HTTP test server.

### Jest Setup (`jest-setup.js`)

Jest 30 sandboxes `process.env`, so `child_process.execSync` uses the real (unsandboxed) environment by default. The setup file (`src/__tests__/test-utils/jest-setup.js`) patches `execSync` to pass the test's `process.env`, making env modifications (e.g. PATH changes for stub binaries) visible to child processes.

### HTTP Test Server

A local HTTP test server (`src/__tests__/test-utils/http-test-server.js`) replaces mocking for HTTP interactions. It creates a real Node.js HTTP server on a random port, records requests, and returns configured responses.

```javascript
let testServer;

beforeAll(async () => {
  testServer = createHttpTestServer();
  const port = await testServer.start();
  // configure routes...
});

afterAll(async () => {
  await testServer.stop();
});
```

Modules that accept URLs as parameters (like `gitHubRequest`) receive test server URLs directly. This tests real HTTP behavior: headers, status codes, response parsing, error handling.

### Test Organization

Tests use nested `describe` blocks to organize scenarios. Common setup goes in outer `beforeEach`, specific conditions in nested blocks. Each test asserts one condition.

```javascript
describe('moduleName', () => {
  describe('functionName', () => {
    describe('with valid input', () => {
      let result;
      beforeEach(async () => {
        result = await functionName(validInput);
      });

      test('returns expected value', () => {
        expect(result).toBe(expected);
      });
    });

    describe('with invalid input', () => {
      test('throws descriptive error', async () => {
        await expect(functionName(invalid)).rejects.toThrow(/message/);
      });
    });
  });
});
```

## Module Test Strategy

### Tier 1 — Full Behavioral (No Mocks)

| Module           | Test Strategy                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `github.js`      | HTTP test server. Pass test server URLs to `gitHubRequest`. Verify auth headers, response handling, option merging with real HTTP |
| `load-inputs.js` | Set `process.env.INPUT_*` variables directly. `@actions/core.getInput()` reads these from the environment                         |
| `exec.js`        | Run real commands (`echo`, `false`). Verify output capture vs stdio inheritance, error propagation                                |

### Tier 2 — Behavioral with Boundary Mocks

| Module                        | Mocked Boundaries                                  | Behavioral Coverage                                                                                                       |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `error-handler.js`            | `@actions/core`                                    | Verify error message propagation, action failure marking                                                                  |
| `check-environment.js`        | `fs` (selective: `/etc/os-release`)                | Throws/doesn't throw for each Ubuntu version. Test behavior, not fs call arguments                                        |
| `check-kubernetes-version.js` | `child_process` (minikube binary), `@actions/core` | HTTP test server for GitHub API. Test three outcomes: SUPPORTED, UNSUPPORTED, throws                                      |
| `download.js`                 | `@actions/core`, `../github`, `../exec`            | HTTP test server for GitHub API. Real downloads and tar extractions. Test asset selection, file extraction, systemd setup |

### Tier 3 — Boundary Mocks with Behavioral Style

| Module                     | Mocked Boundaries                                                           | What to Test                                                          |
| -------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `configure-environment.js` | `../exec`, `../download`                                                    | Driver branching: `docker` vs `none` installs different components    |
| `install.js`               | `child_process`, `@actions/core`, `@actions/io`, `check-kubernetes-version` | Force flag logic, start command construction, version status handling |

### Not Unit-Tested

| Module     | Reason                                                                         |
| ---------- | ------------------------------------------------------------------------------ |
| `index.js` | Pure orchestration. Tested via E2E workflows in `.github/workflows/runner.yml` |

## Related Code

| Component        | Location                                       |
| ---------------- | ---------------------------------------------- |
| Test files       | `src/__tests__/*.test.js`                      |
| HTTP test server | `src/__tests__/test-utils/http-test-server.js` |
| Source modules   | `src/*.js`                                     |
| CI workflow      | `.github/workflows/check.yml`                  |
| E2E workflow     | `.github/workflows/runner.yml`                 |
| Jest config      | `package.json` (`scripts.test`)                |

---

## Implementation Progress

> Ephemeral section — tracks the refactoring from mock-heavy CJS tests to behavioral ESM tests. Updated as phases are completed. Remove once all phases are done.

### Context

Tests currently use Jest with CJS-specific mocking patterns. All 9 test files follow the same structure:

```javascript
beforeEach(() => {
  jest.resetModules();
  jest.mock('@actions/core');
  jest.mock('../some-module');
  module = require('../module-under-test');
  dependency = require('@actions/core');
});
```

This pattern is:

- **CJS-only** — `require()` and `jest.mock()` don't work with ES Modules
- **Implementation-coupled** — tests verify mock call arguments rather than observable behavior
- **Fragile** — any refactoring breaks tests even when behavior is preserved

### Current Test Inventory

| Test File                          | Tests | Mocks                     | Approach   |
| ---------------------------------- | ----- | ------------------------- | ---------- |
| `check-environment.test.js`        | 29    | fs (selective)            | Behavioral |
| `check-kubernetes-version.test.js` | 8     | core, exec, github        | Behavioral |
| `configure-environment.test.js`    | 13    | exec, download            | Behavioral |
| `download.test.js`                 | 19    | core, github, exec        | Behavioral |
| `error-handler.test.js`            | 3     | core                      | Behavioral |
| `exec.test.js`                     | 5     | none                      | Behavioral |
| `github.test.js`                   | 6     | none                      | Behavioral |
| `install.test.js`                  | 19    | core, io, exec, check-k8s | Behavioral |
| `load-inputs.test.js`              | 8     | none                      | Behavioral |

### ESM Test Conversion

When tests convert to ESM, the mocking pattern changes:

| CJS Pattern                    | ESM Pattern                                      |
| ------------------------------ | ------------------------------------------------ |
| `jest.mock('pkg')`             | `jest.unstable_mockModule('pkg', () => ({...}))` |
| `const mod = require('./mod')` | `const mod = await import('./mod.js')`           |
| `jest.resetModules()`          | `jest.resetModules()` (same)                     |
| Sync `beforeEach`              | Async `beforeEach` (due to `await import()`)     |

Jest ESM requires the `--experimental-vm-modules` Node.js flag. The `jest.unstable_mockModule` API has known issues ([jest#15690](https://github.com/jestjs/jest/issues/15690)). If this proves unreliable during Phase 6, Vitest is the fallback — it has native ESM support with a near-identical API (`vi.mock()`, `vi.resetModules()`), and was used successfully in the [yakd ESM migration](https://github.com/manusa/yakd/commit/8b8cf992a0786bbbfbc371139fb3f627487b612e).

### Phases

| Phase   | Description                                                                                           | Status      |
| ------- | ----------------------------------------------------------------------------------------------------- | ----------- |
| Phase 1 | Create HTTP test server utility, refactor `github.test.js` to fully behavioral                        | Done        |
| Phase 2 | Refactor `load-inputs.test.js` and `error-handler.test.js` — style improvements                       | Done        |
| Phase 3 | Refactor `check-kubernetes-version.test.js` and `download.test.js` — HTTP test server + reduced mocks | Done        |
| Phase 4 | Refactor `check-environment.test.js` and `exec.test.js` — behavioral style, keep boundary mocks       | Done        |
| Phase 5 | Refactor `configure-environment.test.js` and `install.test.js` — behavioral style with boundary mocks | Done        |
| Phase 6 | Convert all tests to ESM syntax (bridge to architecture ESM migration Phase 2)                        | Not started |

Phases 1–5 are done while still on CJS. Phase 6 converts to ESM and connects with the [architecture migration](architecture.md#implementation-progress).
