import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalEndpoint, baseURLFor, catalogEndpoint } from '../src/endpoint.js'
import { catalogURL } from '../src/catalog.js'

test('one server root resolves from every spelling the gateway documents', () => {
  const root = 'https://gateway.example.com'
  for (const spelling of [root, root + '/', root + '/v1', root + '/v1/', root + '/V1', root + '/v1beta', root + '/v1beta/']) {
    assert.equal(canonicalEndpoint(spelling), root, spelling)
  }
  assert.equal(canonicalEndpoint('https://gateway.example.com/cpa/v1'), 'https://gateway.example.com/cpa')
  assert.equal(canonicalEndpoint('https://gateway.example.com/v1/cpa'), 'https://gateway.example.com/v1/cpa')
  assert.equal(canonicalEndpoint('  https://gateway.example.com/v1  '), root)
})

test('a deployment path survives while the version segment is removed', () => {
  assert.equal(canonicalEndpoint('http://127.0.0.1:8317/prefix/v1'), 'http://127.0.0.1:8317/prefix')
  assert.equal(catalogEndpoint('http://127.0.0.1:8317/prefix/v1'), 'http://127.0.0.1:8317/prefix/v1/models')
})

test('an invalid endpoint is refused instead of silently mangled', () => {
  for (const bad of ['', '   ', 'not a url', 'ftp://host/v1', null, undefined]) {
    assert.throws(() => canonicalEndpoint(bad), TypeError, String(bad))
  }
})

test('each protocol receives the base its SDK appends its own path to', () => {
  const root = 'https://gateway.example.com'
  assert.equal(baseURLFor(root, 'anthropic-messages'), root)
  assert.equal(baseURLFor(root, 'openai-completions'), root + '/v1')
  assert.equal(baseURLFor(root, 'openai-responses'), root + '/v1')
  assert.equal(baseURLFor(root, 'google-generative-ai'), root + '/v1beta')
  // A base saved by an older build with /v1 derives the same result.
  assert.equal(baseURLFor(root + '/v1', 'anthropic-messages'), root)
  assert.equal(baseURLFor(root + '/v1', 'openai-completions'), root + '/v1')
})

test('a catalog request is identical whether or not the user typed /v1', () => {
  const expected = 'http://127.0.0.1:8317/v1/models?client_version=dsh-cliproxyapi-provider'
  for (const spelling of ['http://127.0.0.1:8317', 'http://127.0.0.1:8317/', 'http://127.0.0.1:8317/v1', 'http://127.0.0.1:8317/v1/']) {
    assert.equal(catalogURL(spelling), expected, spelling)
  }
})
