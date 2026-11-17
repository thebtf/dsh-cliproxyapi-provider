# npm Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement npm-only normal distribution with byte-identical GitHub recovery assets and verified post-publication catalog updates.

**Architecture:** Keep release orchestration in GitHub Actions, with testable Node ESM helpers for artifact verification and catalog updates. GitHub remains the release trigger and recovery host, not an updater. Registry verification gates both recovery asset promotion and catalog changes.

**Tech Stack:** Node.js >=24.9.0, node:test, npm, GitHub Actions, existing semver dependency.

**Spec:** RELEASING.md, Distribution policy accepted 2026-11-17.

## Global Constraints

- No plugin-owned updater, implicit source switching, version bump, live profile migration, publishing, or deletion of existing refs in this implementation.
- Preserve existing RELEASING.md changes and unrelated untracked files.
- Keep engines.dsh >=0.2.2-rc.3 <1.0.0 unchanged; correct claims that 0.x guarantees compatibility.
- Pack once; test and publish that artifact; compare registry bytes before attaching recovery asset and checksum.
- Stable versions use latest; prereleases use next. Dist-tags do not control every DSH recommendation.
- Registry delay must not burn another version or advertise an unavailable release.

## Review Focus

- Rerun after an already-published version: compare integrity, refuse different bytes; never silently overwrite recovery assets.
- HTTP errors, missing registry metadata, malformed timestamps, and checksum mismatch: no catalog write.
- Concurrent main changes: use a catalog pull request rather than force-pushing main.
- Manual dry run: no npm publication, Release modification, or catalog PR.
- Git/file migration: preserve configuration and identities; document manual transition, never mutate the user's live profile for testing.

## Task 1: Artifact and catalog helpers

**Files:** create scripts/release-artifacts.mjs, scripts/update-market.mjs, test/release.test.js.

**Interfaces:** verifyArtifact(bytes, integrity) throws on mismatch; updateMarket(index, manifest, publishedAt) returns a new index with the exact npm version and registry Unix timestamp. CLI wrappers read explicit paths and use explicit registry URLs; importing modules has no effects.

- [x] Write failing node:test cases for matching/mismatching SHA-512 integrity, invalid metadata, timestamp seconds, idempotent catalog update, preservation of historical entries and other plugins, conflicting existing version, and manifest engine alignment.
- [x] Run C:/nvm4w/nodejs/node.exe --test test/release.test.js and confirm intended failures.
- [x] Implement bounded registry requests with timeouts, exact package/version verification, and integrity-checked tarball retrieval. Write catalog only after successful verification; use atomic file replacement.
- [x] Validate the full index against the real DSH market-index parser using a pinned development dependency; update package-lock.json consistently without deleting it by default. Cover invalid source, duplicate versions, and malformed timestamps with negative controls.
- [x] Run focused tests, then the entire node --test suite.

## Task 2: Pack-once publication workflow

**Files:** modify .github/workflows/publish.yml; extend test/release.test.js; modify package.json and package-lock.json only for test/validation tooling if needed.

- [x] Add failing workflow contract checks for strict npm ci, one npm pack, explicit artifact publication, explicit dist-tag, safe dry-run gating, tag/manifest consistency, and no catalog update before registry verification.
- [x] Replace npm ci || npm install with npm ci. Keep least-privilege job permissions and existing OIDC authentication.
- [x] Pack to a staging directory once; install that tarball in a temporary fixture and verify packaged entrypoints/client/locales/patch plus manifest identity. Keep temporary files out of the package and repository.
- [x] Publish the staged tarball with provenance and explicit tag; retain bounded pending-publication handling. Verify npm serves identical bytes, including when publication already exists.
- [x] Attach the verified tarball and SHA-256 checksum to the matching GitHub Release. Existing assets must match or fail; no blind clobber. Manual publishing requires an existing matching release/tag; dry run needs neither and has no external writes.
- [x] Generate the catalog update from verified registry metadata on current main, validate it, and open/update a dedicated bot PR scoped to market/index.json. If repository permissions prohibit PR creation, fail clearly while retaining the verified artifact; do not force-push main.
- [x] Test helpers with a local HTTP fixture covering delayed metadata, 404/500, invalid JSON, truncated/mismatched tarballs and timeout. Inspect workflow YAML and run an offline/local dry-run path without publishing.

## Task 3: Documentation, migration guidance, final verification

**Files:** modify README.md, README_EN.md, RELEASING.md; correct compatibility comment in test/package.test.js; extend package/release tests as needed.

- [x] Remove GitHub-aware updater and moving latest-branch recommendations. Keep historical Git references available, but document npm as the normal source.
- [x] Document backup, explicit replacement of same-name Git/file installs, restart, identity/configuration checks, and rollback boundaries. Old package names need a separate checked migration; do not promise automatic safety.
- [x] Exercise migration in a disposable profile if the installed DSH CLI supports it; never use the live desktop profile. If blocked, label instructions unverified rather than claim a successful migration.
- [x] Update release instructions to match implemented commands and distinguish automation from manual recovery. Explain registry delays, deprecation limitations, dependency availability, and remaining GitHub CI dependency.
- [x] Run npm ci in an isolated checkout, npm run check, focused release tests, pack/install verification, git diff --check, and inspect the full diff.
- [x] Obtain an independent whole-change review; fix findings and rerun relevant tests. Report remaining external validations (OIDC publish/asset upload/catalog PR) honestly; do not release automatically.

## Execution progress (2026-11-18)

- User explicitly waived repeated process approvals. Working on feature branch feat/npm-release-pipeline in existing checkout to preserve accepted uncommitted policy. No live installation or publication.
- Independent UI version request added: manifest-derived pluginVersion in gateway state, neutral badge near status; implemented with two rendering regressions and endpoint assertion. Worker reports 102/102 tests pass; final integration review pending.
- Release scripts/workflow and disposable migration validation delegated to independent workers with disjoint write scopes. Documentation integrated by captain.
- Baseline before implementation: 100/100 tests passed.
- Both READMEs now describe npm as normal source and explicit conservative source migration. Compatibility comment no longer claims 0.x cannot break.

## Execution

Recommended: native implementation with one independent review at the end because all three tasks share one release contract. Use a linked worktree only with user consent, copying the accepted RELEASING.md change into it without disturbing the original checkout. Otherwise use the current checkout on a feature branch. No production implementation has started when this plan is recorded.

## Verification record

- Captain final npm run check: 127 tests passed, zero failures; git diff --check clean.
- Release worker: focused 25/25; real pack/install and nonpublishing dry-run passed; isolated npm ci installed 145 packages; YAML parsed.
- Migration worker: isolated DSH_HOME with file and pinned-local-Git is-number fixtures replaced by npm is-number@7.0.0, preserving sentinel settings and profile configuration. This is mechanism evidence, not full CLIProxyAPI runtime/credential migration.
- Production OIDC, GitHub uploads, generated catalog PR and live UI installation intentionally not exercised.
- Independent final review: PASS with external-validation limitations. Reviewer independently ran 127/127 full-suite and 43/43 targeted tests plus git diff --check; no concrete high-priority issues remain.
