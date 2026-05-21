# Setup Minikube GitHub Action - AI Agents Instructions

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

This file provides guidance to AI coding agents (GitHub Copilot, Claude Code, etc.) when working with code in this repository.

## Project Overview

A GitHub Action that sets up a single-node Kubernetes cluster using Minikube in CI workflows. It downloads and installs Minikube with specified versions of Kubernetes, supporting multiple drivers (`none`, `docker`) and container runtimes (`docker`, `cri-o`, `containerd`). Built with Node.js 24 using GitHub Actions toolkit libraries.

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
  check-kubernetes-version.js # Validates K8s version against Minikube's supported list
  configure-environment.js # Prepares system (apt packages, Docker, CNI plugins)
  download.js           # Downloads binaries from GitHub releases (Minikube, CNI plugins, crictl, cri-dockerd)
  error-handler.js      # Global error handling
  exec.js               # Shell command execution utilities
  github.js             # GitHub API request utility (authenticated/unauthenticated)
  install.js            # Installs and starts Minikube
  load-inputs.js        # Loads action inputs via @actions/core
  __tests__/            # Jest unit tests (mirror src/ structure)

action.yml              # GitHub Action definition (outputs: `force`)
.github/workflows/
  check.yml             # CI: format check + unit tests
  runner.yml            # E2E tests: runs action against multiple K8s versions
```

### Design Patterns

- **Modular pipeline**: `index.js` orchestrates: `checkEnvironment()` → `loadInputs()` → `configureEnvironment(inputs)` → `download.downloadMinikube(inputs)` → `install(downloadedFile, inputs)`. Note: binary downloads for CNI plugins, crictl, and cri-dockerd happen inside `configureEnvironment()`, not as a separate pipeline step.
- **GitHub Actions toolkit**: Uses `@actions/core` for inputs/outputs, `@actions/tool-cache` for downloads
- **GitHub API integration**: `src/github.js` provides a `gitHubRequest` utility wrapping Axios for authenticated/unauthenticated GitHub API calls. Used by `download.js` and `check-kubernetes-version.js`.
- **Driver-specific logic**: Different setup paths for `none` vs `docker` drivers (none requires CNI plugins, crictl, cri-dockerd)
- **Kubernetes version validation**: `check-kubernetes-version.js` checks if the requested K8s version is in Minikube's built-in supported list. If not, it verifies the version exists as a GitHub release and returns `UNSUPPORTED` (triggering `--force` flag). If the version doesn't exist at all, it throws an error.

### Key Dependencies

**npm packages (in `package.json`):**
- `@actions/core` - Action inputs, outputs, and logging
- `@actions/github` - GitHub context utilities
- `@actions/io` - File system operations
- `@actions/tool-cache` - Binary downloads and caching
- `axios` - HTTP requests to GitHub API (via `src/github.js`)

**Binary dependencies (pinned versions in `src/download.js`):**
- **CNI plugins** (`containernetworking/plugins`) - Required by cri-dockerd and recent Minikube releases for container networking
- **cri-tools / crictl** (`kubernetes-sigs/cri-tools`) - CRI CLI tool for interacting with container runtimes
- **cri-dockerd** (`Mirantis/cri-dockerd`) - CRI shim for Docker Engine

These binaries are downloaded at runtime from GitHub releases. Their versions are hardcoded as `const tag = '...'` values in `src/download.js` (not in `package.json`).

### SHA256 Verification

Every binary downloaded by `src/download.js` is SHA256-verified before use. Two helpers funnel all downloads — **no bare `tc.downloadTool` call should appear in this module**:

- **`downloadGitHubArtifact(...)`** — for release-asset downloads. Requires exactly one of:
  - **`verifyWithCompanionSha256: true`** — looks up the `<asset.name>.sha256` companion asset in the same release, fetches its body via `gitHubRequest` (with `responseType: 'text'`), parses the leading hex token, validates the format with `assertSha256Hex`, and aborts on mismatch. Used for **minikube**, **CNI plugins**, and **crictl** — all three upstreams publish `.sha256` companions.
  - **`expectedSha256: '<hex>'`** — verifies against a pinned hex value. Used for **cri-dockerd**, whose releases do not publish any checksum companion files. Pinned values live in `src/checksums.js`.

  Passing both options throws "both provided"; passing neither throws "neither provided" — the funnel is fail-loud on misuse.

- **`downloadVerifiedUrl({url, expectedSha256, label})`** — for direct-URL downloads that aren't release assets (e.g. the cri-dockerd source archive at `github.com/<repo>/archive/refs/tags/<v>.tar.gz`). Pairs `tc.downloadTool` with `verifySha256File` so download and verification cannot drift apart.

When `installCriDockerd` runs on an arch with no pinned digest in `checksums.criDockerd.binarySha256`, it throws an arch-specific error before reaching the funnel ("No pinned SHA256 for arch=…") — adding a new arch to `src/arch.js` without updating `src/checksums.js` fails fast with a self-diagnosing message.

`verifySha256File` and the parser both call `assertSha256Hex` to reject non-hex / wrong-length inputs early, so a malformed companion response or a typo in `checksums.js` surfaces as "Invalid SHA256 digest" rather than a generic mismatch.

When a verification fails, the action throws and aborts before any extraction or installation. There is no fallback path.

## Code Style

### Formatting

Prettier is configured via `.prettierrc.json`:
- Semicolons enabled
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

### Adding Support for a New Architecture

Architecture detection lives in `src/arch.js`, which maps `process.arch` to the GitHub release naming convention used by the binaries this action downloads (e.g. `x64` → `amd64`, `arm64` → `arm64`). To add a new architecture:

1. Extend the `switch` in `src/arch.js` with the new `process.arch` value and its GitHub release suffix. Keep the default branch throwing — the strict allow-list is intentional so unsupported runners fail fast.
2. Add coverage in `src/__tests__/arch.test.js` (the success case) and `src/__tests__/check-environment.test.js` (the fail-fast behavior on unsupported archs).
3. Add fixtures and an `on <arch> host` describe in `src/__tests__/download.test.js` for each of the four downloads (Minikube, CNI plugins, crictl, cri-dockerd) so the asset predicates are verified end-to-end.
4. Extend the `os` matrix axis in `.github/workflows/runner.yml` for the jobs that exercise the relevant code path (at minimum `default-inputs` for the `none` driver and `docker-driver` for the docker path).
5. Confirm the four upstreams publish assets for the new architecture before relying on it — release naming is upstream-defined and not all tags carry every arch.

### Adding a New Action Input

1. Add input definition in `action.yml`
2. Load the input in `src/load-inputs.js` using `core.getInput()`
3. Use the input in relevant modules (`configure-environment.js`, `install.js`)
4. Add tests in `src/__tests__/load-inputs.test.js`

### Updating Dependencies

**CRITICAL**: This is a GitHub Action. `node_modules/` is committed to the repository with production dependencies only. Every dependency update commit must include the updated `node_modules/` contents for production dependencies.

**For each dependency update, follow this exact sequence:**

1. Start from a clean git state (no uncommitted changes)
2. Install the updated package: `npm install <package>@<version> --save-exact --ignore-scripts`
3. Install all dependencies (needed for testing): `npm install --ignore-scripts`
4. Run tests: `npm test`
5. Run format check: `npm run format-check` (if updating prettier, run `npm run format` first and include reformatted source files in the commit)
6. **Prune devDependencies**: `npm prune --omit=dev --ignore-scripts`
7. Stage and commit: `git add package.json package-lock.json node_modules/` (and any reformatted source files)
8. Create one commit per dependency update

**Common mistakes to avoid:**
- **Forgetting to commit `node_modules/`**: The action runs directly from the repo, so `node_modules/` must always be committed with production deps
- **Committing devDependencies in `node_modules/`**: Always run `npm prune --omit=dev` before staging `node_modules/`
- **Mixing multiple dependency updates in one commit**: Update and commit each dependency separately
- **Running `npm test` after pruning**: Jest is a devDependency, so tests must run before `npm prune --omit=dev`
- **Not running format check after updating prettier**: New prettier versions may reformat existing code — run `npm run format` and include those changes in the commit

**DevDependency updates** (jest, prettier, husky) only change `package.json` and `package-lock.json` since they are pruned from `node_modules/` before committing.

**Production dependency updates** (axios, @actions/core, @actions/tool-cache, etc.) change `package.json`, `package-lock.json`, AND files within `node_modules/`.

#### Binary dependency updates (CNI plugins, cri-tools, cri-dockerd)

These are **not** npm packages. Their versions are hardcoded in `src/download.js` as `const tag = '...'` values (or in `src/checksums.js` for cri-dockerd), and they also have matching version strings in `src/__tests__/download.test.js`.

**To update a binary dependency:**

1. Check the latest release on the corresponding GitHub repo
2. Update the `const tag` value in `src/download.js` (or `criDockerd.tag` in `src/checksums.js` for cri-dockerd)
3. Update the matching URL in `src/__tests__/download.test.js`
4. **For cri-dockerd only**: also recompute and update the pinned SHA256 digests — see "Rotating the cri-dockerd pinned digests" below
5. Run tests: `npm test`
6. **Create a separate pull request** (not just a commit) for each binary dependency update — these changes require E2E validation via the `runner.yml` workflow to verify Minikube still starts correctly with the new versions

#### Rotating the cri-dockerd pinned digests

cri-dockerd publishes no `.sha256` companion assets, so its checksums are pinned in `src/checksums.js`. The minikube, CNI plugins, and crictl downloads consume their upstream `.sha256` companions automatically — no pinned values to maintain for those.

When bumping `criDockerd.tag`, recompute all three digests:

```shell
TAG=v0.3.25  # the new tag
curl -sLo /tmp/cri-dockerd-amd64.tgz "https://github.com/Mirantis/cri-dockerd/releases/download/${TAG}/cri-dockerd-${TAG#v}.amd64.tgz"
curl -sLo /tmp/cri-dockerd-arm64.tgz "https://github.com/Mirantis/cri-dockerd/releases/download/${TAG}/cri-dockerd-${TAG#v}.arm64.tgz"
curl -sLo /tmp/cri-dockerd-source.tar.gz "https://github.com/Mirantis/cri-dockerd/archive/refs/tags/${TAG}.tar.gz"
sha256sum /tmp/cri-dockerd-amd64.tgz /tmp/cri-dockerd-arm64.tgz /tmp/cri-dockerd-source.tar.gz
```

Paste the three hex values into `criDockerd.binarySha256.amd64`, `criDockerd.binarySha256.arm64`, and `criDockerd.sourceSha256` respectively. Mismatches at runtime cause the action to abort before installing anything, so getting these wrong is loud (action fails) rather than silent.

**Common mistakes to avoid:**
- **Forgetting to update the source archive digest**: `sourceSha256` is for the GitHub auto-generated archive (`archive/refs/tags/<tag>.tar.gz`), not a release asset — easy to miss because it isn't listed under "Assets" on the release page.
- **Bumping `tag` without updating digests**: the action will fail at the first download with `SHA256 mismatch for cri-dockerd-<v>.<arch>.tgz`.

### Releasing a New Version

Releases use lightweight tags and a commit message format of `[RELEASE] Release v<version>`. The release commit must update exactly 4 files: `package.json`, `package-lock.json`, `node_modules/.package-lock.json`, and `README.md`.

**Follow this exact sequence:**

1. Bump the version in `package.json`
2. Update the action reference in `README.md` (e.g., `manusa/actions-setup-minikube@v2.16.0` → `@v2.16.1`)
3. Regenerate `package-lock.json`: `npm install --ignore-scripts --package-lock-only`
4. **Prune devDependencies** so `node_modules/.package-lock.json` only contains the version bump (not dev deps): `npm prune --omit=dev --ignore-scripts`
5. Stage all 4 files: `git add package.json package-lock.json node_modules/.package-lock.json README.md`
6. Commit with sign-off: `git commit --signoff -m "[RELEASE] Release v<version>"`
7. Create a lightweight tag: `git tag v<version>`
8. Push: `git push origin master --tags`

**Common mistakes to avoid:**
- **Forgetting to prune dev deps before staging**: `node_modules/.package-lock.json` will have a huge diff with all dev dependencies instead of just the version bump
- **Forgetting `package-lock.json` and `node_modules/.package-lock.json`**: Both lock files must be in the release commit — check against previous releases (e.g., `git show e5e04be --stat`)
- **Running `npm install` instead of `--package-lock-only`**: This reinstalls dev deps into `node_modules/`, requiring another prune

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

## Feature Specifications

Feature specs in `docs/specs/` are **living documentation** that describe architectural decisions and planned features. Unlike ADRs (which are point-in-time decisions), specs are updated whenever the feature or architecture changes.

### Purpose

Specs serve as the authoritative reference for:
- **Architecture**: Execution model, module system, dependency management
- **Requirements**: What the feature must do (testable statements)
- **Configuration**: Dependencies, versions, constraints

### When to Read Specs

**Before modifying a feature**: Read its spec to understand current behavior, requirements, and constraints. The spec tells you what invariants must be preserved.

**Before implementing related features**: Specs document integration points and dependencies.

### When to Update Specs

**After changing a feature**: If you modify behavior, architecture, or configuration, update the spec to match. The spec must always reflect the current implementation.

**After adding requirements**: New requirements discovered during implementation should be documented.

### Available Specs

| Feature | Spec | Status | Covers |
|---------|------|--------|--------|
| Architecture | `docs/specs/architecture.md` | In progress (CJS→ESM migration) | Execution model, module system, committed node_modules, pipeline design |
| Testing | `docs/specs/testing.md` | In progress (behavioral refactoring) | Behavioral testing strategy, HTTP test server, mock boundaries, test organization |
