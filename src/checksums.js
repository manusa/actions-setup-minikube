'use strict';

// Pinned SHA256 digests for upstream release artifacts that do not publish
// checksum companion assets alongside their downloads. Verified by
// `src/download.js` after each download.
//
// To rotate (see AGENTS.md > Updating Dependencies > Binary dependency updates):
//   1. Bump `tag`.
//   2. Download each artifact from the new release.
//   3. Recompute every digest with `sha256sum` and update the entries below.
//   4. Bump the matching tag in `src/download.js` and the fixture in
//      `src/__tests__/download.test.js`.
module.exports = {
  // Mirantis/cri-dockerd publishes only .deb/.rpm/.tgz assets — no .sha256 companion files.
  criDockerd: {
    tag: 'v0.3.24',
    binarySha256: {
      amd64: 'dd4b7f514c248a3aaca398f467430a4c58aae9a77ea8b96a2f5b5d6fba0948d1',
      arm64: 'c783a03735887c4a8fc894bd4cf7a1c0defef3ecf50a4d79ff31eed45c26b17e'
    },
    sourceSha256:
      'f8dddd936a9b30594eae459c65b4f1dc98152ee49e15c47b9df930a0ba4d7d88'
  }
};
