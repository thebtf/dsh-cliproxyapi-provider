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
const supportedBuilds = ['0.2.2-rc.3', '0.2.2-rc.4', '0.2.2-rc.5', '0.2.2', '0.2.3-alpha.2', '0.2.3', '0.2.3-beta.1']

test('DSH dependency ranges accept the supported prerelease lines under npm semantics', () => {
  const declared = { ...manifest.peerDependencies, ...manifest.dependencies, ...manifest.devDependencies }
  for (const name of DSH_PACKAGES) {
    for (const version of supportedBuilds) assert.ok(semver.satisfies(version, declared[name]), name + ' rejects ' + version)
  }
  assert.ok(semver.satisfies('4.2.0-alpha.1', manifest.peerDependencies['@deepseek-ai/cordis']))
  assert.ok(semver.satisfies('3.20.0-alpha.1', manifest.dependencies['@deepseek-ai/schemastery']))
})

test('DSH admission includes both supported lines without claiming untested minor lines', () => {
  for (const version of supportedBuilds) assert.ok(semver.satisfies(version, manifest.engines.dsh, { includePrerelease: true }), version)
  for (const version of ['0.2.2-rc.2', '0.2.3-alpha.1', '0.2.4-alpha.1', '0.3.0', '1.0.0']) {
    assert.equal(semver.satisfies(version, manifest.engines.dsh, { includePrerelease: true }), false, version)
  }
})
