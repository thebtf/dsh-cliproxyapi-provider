import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
)

const DSH_PACKAGES = [
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-home-paths',
  '@deepseek-ai/dsh-llm-pi-ai',
  '@deepseek-ai/dsh-util-values',
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-plugin-manager',
  '@deepseek-ai/dsh-client-ui-slots',
]

test('manifest declares an engines.dsh range so core updates do not disable the plugin', () => {
  assert.equal(typeof manifest.engines?.dsh, 'string')
  assert.notEqual(manifest.engines.dsh.trim(), '')
  assert.equal(manifest.engines.dsh.includes('workspace:'), false)
})

// The plugin is built against this core line. app-boot compares versions with
// semver includePrerelease, so the range below is what decides whether an
// installed core keeps the plugin enabled.
const CORE_LINE = '0.2.2'
const SUPPORTED = '>=' + CORE_LINE + '-rc.3 <1.0.0'

test('every DSH package accepts newer builds on the supported core line', () => {
  const pinned = [
    ...Object.entries(manifest.peerDependencies ?? {}),
    ...Object.entries(manifest.dependencies ?? {}),
    ...Object.entries(manifest.devDependencies ?? {}),
  ].filter(([name]) => DSH_PACKAGES.includes(name))
  assert.equal(pinned.length, DSH_PACKAGES.length)
  // Exact pins turned a core prerelease bump into a disabled plugin: the
  // profile then held a version skew that app-boot refused. A caret range on
  // the same core line lets the host satisfy the requirement with whatever
  // build of the supported line it ships, without a new plugin release.
  for (const [name, range] of pinned) {
    assert.equal(range, '^' + CORE_LINE + '-rc.3', name + ' must accept newer ' + CORE_LINE + ' builds')
    assert.equal(semver.subset(range, SUPPORTED), true, name + ' must stay inside the supported core line')
  }
})

test('engines.dsh keeps the plugin enabled across minor core updates', () => {
  // A caret range on a prerelease stops at the next minor version, so a bump of
  // the core from 0.2.x to 0.3.x disabled a plugin whose requirements were
  // still satisfied. The declared range therefore spans the whole 0.x line: the
  // only release that may require a new plugin build is a 1.0 one, where a
  // breaking change is actually allowed.
  assert.equal(manifest.engines.dsh, SUPPORTED)
  assert.equal(semver.subset(manifest.engines.dsh, SUPPORTED), true)
  for (const version of ['0.2.2-rc.3', '0.2.2', '0.2.3', '0.3.0', '0.9.9']) {
    assert.equal(semver.satisfies(version, manifest.engines.dsh, { includePrerelease: true }), true, version + ' must keep the plugin enabled')
  }
  for (const version of ['0.2.2-rc.2', '1.0.0']) {
    assert.equal(semver.satisfies(version, manifest.engines.dsh, { includePrerelease: true }), false, version + ' must not claim support')
  }
})
