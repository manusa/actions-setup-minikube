# Architecture

## Overview

This project is a GitHub Action that sets up Minikube in CI workflows. It is built with Node.js 24 using ES Modules and the GitHub Actions toolkit libraries. Source files and production `node_modules/` are committed directly to the repository — there is no build step or bundler.

## Execution Model

```
GitHub Actions Runner (Node.js 24)
  │
  ├── action.yml          ─── using: 'node24', main: 'src/index.js'
  │
  ├── src/                ─── Source files (executed directly, no transpilation)
  │   ├── index.js        ─── Entry point, orchestrates the pipeline
  │   └── *.js            ─── Modules loaded at runtime
  │
  └── node_modules/       ─── Committed to repo (production deps only)
      ├── @actions/core
      ├── @actions/io
      ├── @actions/tool-cache
      └── axios
```

The GitHub Actions runtime loads `src/index.js` directly as specified in `action.yml`. All production dependencies must be present in the repository at commit time. Dev dependencies (test framework, prettier, husky) are pruned before committing via `npm prune --omit=dev`.

### Why No Bundler

Source files and `node_modules/` are committed as-is. A bundler would:
- Require committing opaque bundled output for every change (unreadable diffs)
- Add a build step that doesn't exist today
- Make debugging production issues harder (source maps, minification)
- Add complexity to the development and dependency update workflow

The current model keeps committed code identical to authored code.

## Module System

The project uses ES Modules (`"type": "module"` in `package.json`). All source files use `import`/`export` with `.js` extensions on relative imports.

```javascript
import core from '@actions/core';
import {logExecSync} from './exec.js';

export {downloadMinikube, installCniPlugins};
```

Conventions:
- Relative imports **must** include `.js` extension (ESM requirement)
- npm and Node.js built-in imports do not need extensions
- ESM is strict by default — no `'use strict';` directives needed

## Pipeline Architecture

`src/index.js` orchestrates a sequential pipeline:

```
checkEnvironment() → loadInputs() → configureEnvironment() → download() → install()
```

Each step is a separate module with a single responsibility:

| Module | Responsibility |
|--------|----------------|
| `src/check-environment.js` | Validates Ubuntu version (18, 20, 22, 24) |
| `src/load-inputs.js` | Loads action inputs via `@actions/core` |
| `src/configure-environment.js` | Prepares system (apt packages, Docker, CNI plugins) |
| `src/download.js` | Downloads binaries from GitHub releases |
| `src/install.js` | Installs and starts Minikube |

### Supporting Modules

| Module | Responsibility |
|--------|----------------|
| `src/exec.js` | Shell command execution utilities (`execSync`, `logExecSync`) |
| `src/error-handler.js` | Global error handling, sets action as failed |
| `src/github.js` | GitHub API requests via Axios (authenticated and unauthenticated) |
| `src/check-kubernetes-version.js` | Validates Kubernetes version against Minikube's supported list |

## Dependencies

### Production (committed in `node_modules/`)

| Package | Purpose |
|---------|---------|
| `@actions/core` | Action inputs, outputs, and logging |
| `@actions/io` | File system operations |
| `@actions/tool-cache` | Binary downloads and caching |
| `axios` | HTTP requests to GitHub API |

### Dev (pruned before commit)

| Package | Purpose |
|---------|---------|
| Test framework | Unit testing |
| `prettier` | Code formatting |
| `husky` | Git hooks (pre-commit formatting, post-commit pruning) |

### Binary (downloaded at runtime)

Pinned versions hardcoded as `const tag = '...'` values in `src/download.js`:

| Binary | Repository | Purpose |
|--------|-----------|---------|
| CNI plugins | `containernetworking/plugins` | Container networking for cri-dockerd and Minikube |
| cri-tools / crictl | `kubernetes-sigs/cri-tools` | CRI CLI for container runtime interaction |
| cri-dockerd | `Mirantis/cri-dockerd` | CRI shim for Docker Engine |

## Testing

Each source module has a corresponding test file in `src/__tests__/` with `.test.js` suffix. Tests run locally via `npm test`. E2E tests run in GitHub Actions only (`.github/workflows/runner.yml`).

## Related Code

| Component | Location |
|-----------|----------|
| Entry point | `src/index.js` |
| Action definition | `action.yml` |
| Package config | `package.json` |
| Source modules | `src/*.js` |
| Test files | `src/__tests__/*.test.js` |
| CI workflow | `.github/workflows/check.yml` |
| E2E workflow | `.github/workflows/runner.yml` |
| Prettier config | `.prettierrc.json` |

---

<details>
<summary>Design Decisions</summary>

### Why committed node_modules?

GitHub Actions execute directly from the repository. The action must be self-contained — all production dependencies must be available without running `npm install` at action runtime. This is the standard pattern for JavaScript GitHub Actions that don't use a bundler.

### Why no @actions/github?

The project uses Axios directly for GitHub API requests because it needs fine-grained control over request options (custom headers, status validation). The `@actions/github` package (Octokit wrapper) adds unnecessary abstraction for the simple REST calls this action makes.

</details>

---

## Implementation Progress

> Ephemeral section — tracks the migration from CommonJS to ES Modules. Updated as phases are completed. Remove once all phases are done.

### Context

The project is currently CommonJS (`require`/`module.exports`). All four `@actions/*` production dependencies have moved to ESM-only in their latest major versions, requiring a full migration.

| Package | Current (CJS) | Target (ESM-only) |
|---------|---------------|---------------------|
| `@actions/core` | 2.0.3 | 3.0.0 |
| `@actions/github` | 6.0.0 | Remove (unused) |
| `@actions/io` | 2.0.0 | 3.0.2 |
| `@actions/tool-cache` | 3.0.1 | 4.0.0 |
| `axios` | 1.13.6 | 1.13.6 (has CJS fallback, no concern) |

Current CJS patterns across all 10 source files:

| Pattern | Example |
|---------|---------|
| Default export | `module.exports = checkEnvironment` |
| Named exports | `module.exports = {execSync, logExecSync}` |
| External require | `const core = require('@actions/core')` |
| Local require | `const {logExecSync} = require('./exec')` |
| Built-in require | `const fs = require('fs')` |

### Source Conversion Rules

| CJS | ESM |
|-----|-----|
| `const x = require('pkg')` | `import x from 'pkg'` |
| `const {a, b} = require('pkg')` | `import {a, b} from 'pkg'` |
| `const a = require('./mod').a` | `import {a} from './mod.js'` |
| `module.exports = fn` | `export default fn` |
| `module.exports = {a, b}` | `export {a, b}` |
| `'use strict';` | Remove (ESM is strict by default) |

### Test Framework Decision

Tests currently use Jest 30.2.0 with CJS-specific mocking (`jest.resetModules()` + `jest.mock()` + dynamic `require()`). Two options for ESM:

**Option A — Jest with `--experimental-vm-modules`**: Use `jest.unstable_mockModule()` + `await import()`. Relies on experimental APIs at both Node.js and Jest levels. Active bugs reported in `unstable_mockModule` ([jestjs/jest#15690](https://github.com/jestjs/jest/issues/15690)).

**Option B — Vitest**: Native ESM support, near-identical API to Jest. Successfully used in [yakd ESM migration](https://github.com/manusa/yakd/commit/8b8cf992a0786bbbfbc371139fb3f627487b612e). No experimental flags required.

### @actions/* API Changes

Each package jumped multiple major versions. Changelogs must be audited for breaking API changes (renamed functions, changed signatures, removed features) beyond the module format change.

### Phases

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Source conversion to ESM | Not started |
| Phase 2 | Test migration to ESM | Not started |
| Phase 3 | Upgrade @actions/* dependencies | Not started |
| Phase 4 | E2E verification and cleanup | Not started |

### References

- [yakd ESM migration](https://github.com/manusa/yakd/commit/8b8cf992a0786bbbfbc371139fb3f627487b612e) — prior ESM migration, same author
- [Node.js ESM documentation](https://nodejs.org/api/esm.html)
- [Jest ECMAScript Modules](https://jestjs.io/docs/ecmascript-modules) — experimental status and limitations
