import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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
  // build of 0.2.2 it ships, without a new plugin release.
  for (const [name, range] of pinned) {
    assert.equal(range, '^0.2.2-rc.2', name + ' must accept newer 0.2.2 builds')
  }
  assert.equal(manifest.engines.dsh, '^0.2.2-rc.2')
})
