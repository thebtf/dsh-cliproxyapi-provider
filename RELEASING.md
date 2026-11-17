# Releasing

Releases are cut from `main`: bump `package.json`, commit, open a PR, merge it,
then tag the merge commit and publish a GitHub Release. Publishing to npm is
wired to that Release and authenticates with **npm trusted publishing (OIDC)** —
no npm token is stored anywhere in the repository or in GitHub secrets.

## Distribution policy (accepted 2026-11-17)

**npm is the only normal installation and update channel. GitHub Releases
provide release notes and a manual recovery artifact, not a second updater.**
This policy supersedes older references to a GitHub-aware updater or a moving
Git `latest` channel in other documentation.

### Decision and rationale

- Use the DSH package manager for registry installations and version selection.
  Do not build or maintain a plugin-owned GitHub updater or automatic fallback
  that silently changes the installed package source.
- Keep the Discover index as a catalog of exact npm versions. It is not an
  independent distribution channel; installed registry packages do not need it
  to list registry versions.
- Keep GitHub tags and Releases for source history, release notes, publication
  orchestration, and an emergency tarball. The intended pipeline packs once,
  publishes that tarball to npm, and attaches the identical bytes to the Release
  with a checksum. A recovery tarball is not a promise of offline installation:
  dependencies must also be available.
- Retain existing Git references during migration. Moving a Git, file, or
  old-package-name installation to npm must be explicit and tested to preserve
  settings, credentials, provider/model identities, and a single active copy.
  Do not delete old branches or tags merely because this policy is accepted.

This avoids the cost and failure modes of two update mechanisms while retaining
manual recovery when npm is unavailable. npm outages, publication delays, and
mirror lag remain accepted delivery risks. Existing installations do not depend
on npm availability to keep running.

### Release safeguards

1. Verify the exact npm version and tarball are available before advertising it
   in the Discover index. Derive its timestamp from the registry, validate the
   index, and keep its compatibility metadata aligned with the package.
2. Use explicit stable/prerelease publication tags. Do not assume changing npm
   `latest` controls every DSH recommendation or rolls back existing installs.
3. Test the packed artifact and fail on lockfile installation errors rather than
   silently resolving a different dependency tree. A fixed plugin version with
   ranged dependencies is not a fully reproducible installation.
4. For a bad release, publish a fix, deprecate the bad version, adjust the catalog,
   and document recovery. Deprecation is a warning, not an install prohibition;
   restoring package files is not necessarily a rollback of migrated data.
5. Treat DSH compatibility separately from distribution. A broad `engines.dsh`
   range prevents unnecessary gating but does not prove future API compatibility;
   verify supported cores and dependency/peer ranges with tests.

### Implementation status

The pipeline is implemented in the release scripts and workflow. Local tests
cover registry verification, catalog validation, artifact packaging, repeat-run
conflicts and nonpublishing paths. Production OIDC publication, GitHub asset
upload and catalog PR creation require a separately authorized live release.
Same-name file/Git source replacement was tested with disposable plain-package
fixtures; complete historical CLIProxyAPI bundle migration remains unverified.
No release, installed-profile change, or Git-ref removal occurs merely by
changing this documentation.

## How the npm side works

The workflow has three ordered jobs: publish, recovery, and catalog. Manual
workflow dispatch defaults to dry-run. A real dispatch must run at the matching
release tag, not an arbitrary branch. Publishing is still an explicit maintainer
action; implementing this pipeline does not itself publish anything.

1. Install Node 24 and the pinned npm CLI, then use strict `npm ci` and run checks.
   There is no fallback to resolving dependencies with `npm install`.
2. Verify tag/manifest/checkout agreement and the existing GitHub Release for
   real publication. Build one tarball in external staging, install it into a
   temporary fixture with scripts disabled, and check packaged entrypoints,
   locales, patch, syntax and manifest identity. This does not claim full DSH
   activation testing or a completely locked consumer dependency tree.
3. Publish that tarball with OIDC provenance and an explicit dist-tag: stable
   uses `latest`, prerelease uses `next`. If the exact version exists, do not
   publish it again. In either case verify registry identity, compatibility,
   timestamp, integrity and downloaded tarball byte equality.
4. Preserve staging as a workflow artifact, including on publication-verification
   failure after successful packing. Pending registry propagation is a failed
   verification, not a reason to invent a new version number.
5. Reverify npm in the recovery job. Attach the identical tarball and a SHA-256
   checksum to the matching Release. Existing same-name assets must match;
   mismatches fail rather than overwrite. Verify the uploaded assets again.
6. Check out current main separately from release tooling. Reverify npm, update
   the catalog atomically with registry time, validate the entire index with the
   pinned real DSH parser, and propose only the catalog change in a per-version
   PR. Nothing force-pushes or automatically merges main.

The publish job has read access plus OIDC; the recovery job has contents write;
the catalog job has contents and pull-request write. The repository must allow
GitHub Actions to create pull requests. If org/repository policy blocks that,
the catalog job fails without undoing an already successful npm publication.
Review/merge the generated PR normally. Workflows triggered by the default
GITHUB_TOKEN may not run automatically on the generated PR; run required checks
through the repository's approved mechanism rather than bypassing protection.

### Local nonpublishing verification

Use a new, empty staging directory outside this checkout:

```powershell
node scripts/prepare-release.mjs package.json C:/Temp/cpa-release-check
node scripts/publish-release.mjs C:/Temp/cpa-release-check/manifest.json C:/Temp/cpa-release-check/thebtf-dsh-cliproxyapi-provider-0.5.0.tgz v0.5.0 --dry-run
```

Use the tarball path/version actually printed by prepare-release, not the example
version after a bump. Preparation performs npm downloads for the disposable
install, but does not publish. Publish dry-run performs no registry publication,
Release mutation, or catalog PR. It is not proof that production OIDC permissions
or remote writes work. A successful real run is still needed to prove those.

For delayed publication or a partial failure, retain the original tested artifact.
Retry verification/recovery/catalog with those bytes. Never replace a conflicting
published version or recovery asset. A fresh pack on a later run is accepted only
if the registry comparison proves identical bytes; otherwise investigate.

## One-time setup on npmjs.com

Trusted publishers can only be attached to a **package that already exists**:
npm has no "pending publisher" flow, so a brand-new package name cannot be
bootstrapped through OIDC. That leaves exactly one manual step, done once.

### 1. Publish the first version by hand

From a checkout of `main` at the release commit, with the version you want to
start from:

```powershell
npm login                 # interactive, one time
npm publish --access public
```

(`npm stage publish` also works on npm 11.15.0+ — the version lands in the
staged queue and a maintainer approves it with 2FA. Either way a person signs
off the very first publish.)

No token needs to be created or stored for this. `npm login` keeps a session
on your machine only.

### 2. Attach the trusted publisher

Either on the website — package → Settings → Trusted publishing → GitHub
Actions — with:

| Field | Value |
| --- | --- |
| Organization or user | `thebtf` |
| Repository | `dsh-cliproxyapi-provider` |
| Workflow filename | `publish.yml` (filename only, with extension) |
| Environment name | _(leave empty)_ |
| Allowed actions | `npm publish` **must be checked** |

or from the terminal:

```powershell
npm trust github @thebtf/dsh-cliproxyapi-provider `
  --file publish.yml --repo thebtf/dsh-cliproxyapi-provider `
  --allow-publish
npm trust list @thebtf/dsh-cliproxyapi-provider
```

`npm trust` requires npm 11.15.0+, write access to the package and 2FA enabled
on the account.

> **The configuration expires after two days** unless its first publish
> succeeds. Add it when the next release is ready to ship, not weeks earlier.

### 3. Optional hardening

Once a release has gone through the workflow, open package → Settings →
Publishing access → *Require two-factor authentication and disallow tokens*.
Trusted publishers keep working; long-lived tokens stop being able to publish.

## Cutting a release

```powershell
# 1. bump the version
npm version patch --no-git-tag-version     # or minor / major

# 2. commit the package changes, open a PR, and merge
#    Publish the market entry only after npm availability is verified.

# 3. tag the merge commit and publish the Release
git tag -a v0.4.4 -m "v0.4.4 - <headline>"
git push origin v0.4.4
gh release create v0.4.4 --title "v0.4.4 - <headline>" --notes-file .agent/runs/cpa-gateway/release-notes-0.4.4.md --latest
```

Publishing the Release triggers the workflow. Watch it with:

```powershell
gh run list --workflow publish.yml --limit 3
gh run watch
```

## Market index

`market/index.json` is the DSH plugin-market index. Each release needs a new
entry under `plugins[0].versions`:

```json
{
  "version": "0.4.4",
  "publishTimestamp": 1763081476,
  "source": { "type": "npm" },
  "engines": { "dsh": ">=0.2.2-rc.3 <1.0.0" }
}
```

- `publishTimestamp` is in **seconds**, not milliseconds.
- New releases use `{"type": "npm"}` only after the exact version and tarball
  are available from npm. Do not temporarily advertise a Git source while npm
  publication is pending. Preserve historical references for existing users.
- Versions are re-sorted by SemVer automatically; the order you write them in
  does not matter.

The catalog job proposes this change in a PR after registry and recovery
verification. Do not pre-add the next release entry manually. For reviewing a
generated PR or a deliberate catalog repair, validate the index locally with
the pinned real DSH parser before proposing the change:

```powershell
node --input-type=module -e "import { readFileSync } from 'node:fs'; import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'; parseMarketIndex(JSON.parse(readFileSync('market/index.json', 'utf8')), 'https://raw.githubusercontent.com/thebtf/dsh-cliproxyapi-provider/main/market/index.json'); console.log('Market index valid')"
```

The index is served straight from `main`:
`https://raw.githubusercontent.com/thebtf/dsh-cliproxyapi-provider/main/market/index.json`
