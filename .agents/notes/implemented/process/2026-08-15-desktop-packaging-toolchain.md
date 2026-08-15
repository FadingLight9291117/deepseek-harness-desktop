# Agent Note: Desktop packaging toolchain (desktop-packaging-toolchain)

Status: implemented

English | [中文](2026-08-15-desktop-packaging-toolchain.zh.md)

## Problem

The Electron desktop shell runs from source or from built workspace artifacts, but there is no way to produce an installable macOS application. Naive `@electron/packager` runs fail on this workspace: `prune=true` chokes on workspace symlink devDependencies (galactus), and `prune=false` hits ENAMETOOLONG on the cyclic nested symlink chains (cordis ↔ cordis-plugin-include). The packaged app also must carry the full production closure as real files, because the loader resolves profile rows and the `/plugins/<id>/client.js` route reads them from disk at runtime.

## Decision

### Stage first, then package

`scripts/package-desktop.ts` runs `pnpm --filter @deepseek-ai/dsh-desktop deploy --legacy --prod` into `.artifacts/desktop/staging` (hoisted layout), then packages the staged tree with `@electron/packager` (programmatic API, `prune: false`, `asar: false`). The staging step shares its machinery with the Python SDK executable build through `scripts/deploy-staging.ts` (extracted from `scripts/build-exe-for-python-sdk.ts`).

Staging repairs three deploy gaps before the packager runs:

- **Symlinks**: legacy deploy leaves package symlinks and `.bin` shim dirs; they are materialized into file copies (the packaged payload must be link-free, and a zip must not carry absolute links into the workspace).
- **Omitted closure members**: `pnpm deploy` does not follow `link:` workspace overrides for transitive dependencies (`@deepseek-ai/cosmokit`, a dependency of vendored cordis, is absent although cordis imports it eagerly) and drops some nested real-npm deps. `restoreOmittedClosureDeps` BFS-walks the deployed manifests (the same walk `healProfilesModuleFallback` performs at boot) and copies every missing member from the workspace mirror or the pnpm store; names installed nowhere (optional deps like ws's bufferutil) are skipped, and the packaged boot smoke owns the completeness verdict.
- **Manifest normalization**: the staged manifest gets an X.Y.Z version (CFBundleShortVersionString) and loses devDependencies; dependency names stay complete because the heal reads them.

The packager writes `<out>/<name>-<platform>-<arch>/<name>.app`; the script then ad-hoc signs (`codesign --force --deep --sign -`), smoke-tests the bundle headless (`--headless-boot --port 0`, waits for the boot marker, SIGTERM, exit 0), and zips with `ditto -c -k --keepParent`. `--install` copies into `~/Applications` with `ditto` (fs.cp dereferences the framework symlinks and breaks the bundle) and opens it.

Two traps observed during implementation and now owned by the script:

- The packaged smoke can pass at one path and fail at another: resolution walks up from the anchor, and a bundle sitting under the repo can escape into the repository's own node_modules, masking a missing closure member. The installed-location boot is the real check.
- `pnpm deploy`'s legacy hoisting mutates the deploy source's node_modules in the main workspace, which later makes `pnpm run` fail its deps-status check; the pipeline runs a plain `pnpm install` after staging to restore the canonical state.

### Artifact stance

macOS `.app` in a zip (`dsh-desktop-darwin-<arch>.zip` under `.artifacts/desktop/`), ad-hoc signed. No dmg, no Developer ID signing, no notarization, no auto-update — consistent with the distribution scope recorded in the [desktop shell selection note](../architecture/2026-08-14-desktop-shell-tech-selection.md). A Homebrew cask can consume the release zip later without toolchain changes. The default Electron icon ships; icon assets and Developer ID signing are follow-ups.

### CI

`.github/workflows/package-desktop.yml` mirrors the Python single-exe lane: `workflow_call` + `workflow_dispatch` + PR label `build-desktop`, one matrix job per target (darwin-arm64 on macos-latest, darwin-x64 on macos-13), install → build → package (the script's smoke is the lane's verification) → `upload-artifact@v7` (7-day retention). It is an artifact lane, not part of `all-checks-passed`.

## Consequences

- `pnpm run package:desktop [--targets=...] [--skip-build] [--install] [--dry-run]` produces and optionally installs the app; the first run downloads the Electron dist zip (set `ELECTRON_MIRROR` where github.com is unreachable).
- The packaged app boots the same profile tree as the window dev run; the headless smoke proves bundle completeness (profile resolution, healed fallback, host tree).
- node-pty ships its prebuilt addon as installed in the workspace (dev parity); Electron-ABI rebuilds stay out of scope.
- A browser-downloaded zip carries the quarantine attribute; `xattr -dr com.apple.quarantine dsh-desktop.app` clears it.

## Alternatives considered

**electron-builder.** Standard tooling with dmg and signing hooks, but a larger configuration surface and unknown behavior on pnpm-staged trees; dmg and notarization are out of the v1 scope, so its main advantages were unused.

**Packaging the workspace directory directly.** Both packager prune modes fail on the workspace layout (see Problem); staging is required regardless of the packager.

**dmg artifact.** An installer-shaped distribution form, contradicting the recorded v1 scope.

**A Homebrew cask now.** Requires a public tagged release and stable download URL; the pre-release stance (no external consumers before the first tag) rules it out until then.
