# Releasing

Releases are cut from `main`: bump `package.json`, commit, open a PR, merge it,
then tag the merge commit and publish a GitHub Release. Publishing to npm is
wired to that Release and authenticates with **npm trusted publishing (OIDC)** —
no npm token is stored anywhere in the repository or in GitHub secrets.

## How the npm side works

`.github/workflows/publish.yml` runs on `release: published` (and on manual
dispatch, with an optional dry run). It:

1. installs Node 24 and an npm CLI that supports trusted publishing
   (`npm@^11.15.0` — the feature needs 11.5.1+, `npm trust` needs 11.15.0+);
2. removes the `_authToken` line that `actions/setup-node` writes into
   `.npmrc`. With no token secret that line expands to an empty value, npm
   then assumes the registry is already authenticated and never performs the
   OIDC exchange, so publishing fails with `ENEEDAUTH` or a bare `404`;
3. runs `npm run check`;
4. verifies the Release tag equals `v<package.json version>`;
5. skips when that exact version is already on the registry, otherwise runs
   `npm publish --access public --provenance`.

GitHub mints a short-lived credential bound to this repository and this exact
workflow file; provenance attestations are attached automatically. The
`id-token: write` permission is what enables the exchange.

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
npm trust github @router-for-me/dsh-cliproxyapi-provider `
  --file publish.yml --repo thebtf/dsh-cliproxyapi-provider `
  --allow-publish
npm trust list @router-for-me/dsh-cliproxyapi-provider
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

# 2. update the version in market/index.json (see below), commit, PR, merge

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
  "engines": { "dsh": "^0.2.2-rc.2" }
}
```

- `publishTimestamp` is in **seconds**, not milliseconds.
- Once the package is on npm, use `{"type": "npm"}`. Before that (or while the
  package is still unpublished) pin the commit instead:
  `{"type": "git", "url": "https://github.com/thebtf/dsh-cliproxyapi-provider", "commit": "<40-hex sha>"}`.
- Versions are re-sorted by SemVer automatically; the order you write them in
  does not matter.

Validate the index with the real parser from the DSH core before pushing:

```powershell
node .agent/tmp/test-parse.mjs
```

The index is served straight from `main`:
`https://raw.githubusercontent.com/thebtf/dsh-cliproxyapi-provider/main/market/index.json`
