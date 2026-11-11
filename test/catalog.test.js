import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogURL, modelProfileOf, readCodexCatalog, readCodexCatalogWithMetadata, reasoningEffortsOf } from '../src/catalog.js'

test('maps Codex reasoning levels to Harness canonical levels', () => {
  assert.deepEqual(reasoningEffortsOf({
    supported_reasoning_levels: [
      { effort: 'none' }, { effort: 'minimal' }, { effort: 'high' }, { effort: 'ultra' },
    ]
  }), { off: 'none', minimal: 'minimal', high: 'high', max: 'ultra' })
})

test('omits an off-only reasoning capability rejected by llm-pi-ai', () => {
  assert.equal(reasoningEffortsOf({
    supported_reasoning_levels: [
      { effort: 'none' }, { effort: 'off' },
    ]
  }), undefined)
})

test('maps model metadata and applies safe fallbacks', () => {
  assert.deepEqual(modelProfileOf({
    slug: 'gpt-test', display_name: 'GPT Test', max_context_window: 372000,
    input_modalities: ['text', 'image', 'audio'],
    supported_reasoning_levels: [{ effort: 'low' }, { effort: 'xhigh' }],
  }, { defaultContextWindow: 262144, defaultMaxTokens: 32768, defaultInput: ['text'] }), {
    id: 'gpt-test', name: 'GPT Test', contextWindow: 372000, maxTokens: 32768,
    input: ['text', 'image'], reasoningEfforts: { low: 'low', xhigh: 'xhigh' },
  })
})

test('extracts modalities and reasoning from the Codex catalog response', () => {
  const models = readCodexCatalog({
    models: [
      {
        slug: 'gpt-5.6-sol',
        display_name: 'GPT 5.6 Sol',
        max_context_window: 372000,
        input_modalities: ['text', 'image'],
        supported_reasoning_levels: [
          { effort: 'low' },
          { effort: 'medium' },
          { effort: 'high' },
          { effort: 'xhigh' },
          { effort: 'max' },
          { effort: 'ultra' },
        ],
      },
      {
        slug: 'gpt-5.6-spark',
        display_name: 'GPT 5.6 Spark',
        max_context_window: 128000,
        input_modalities: ['text'],
      },
    ]
  }, { defaultContextWindow: 262144, defaultMaxTokens: 32768, defaultInput: ['text'] })

  assert.deepEqual(models, [
    {
      id: 'gpt-5.6-sol',
      name: 'GPT 5.6 Sol',
      contextWindow: 372000,
      maxTokens: 32768,
      input: ['text', 'image'],
      reasoningEfforts: {
        low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
      },
    },
    {
      id: 'gpt-5.6-spark',
      name: 'GPT 5.6 Spark',
      contextWindow: 128000,
      maxTokens: 32768,
      input: ['text'],
    },
  ])
})

test('uses configured fallbacks when catalog capability fields are absent', () => {
  assert.deepEqual(modelProfileOf({ slug: 'fallback-model' }, {
    defaultContextWindow: 262144,
    defaultMaxTokens: 32768,
    defaultInput: ['text'],
  }), {
    id: 'fallback-model',
    name: 'fallback-model',
    contextWindow: 262144,
    maxTokens: 32768,
    input: ['text'],
  })
})

test('filters hidden models by default and deduplicates slugs', () => {
  const models = readCodexCatalog({
    models: [
      { slug: 'visible', context_window: 1000 },
      { slug: 'visible', context_window: 2000 },
      { slug: 'hidden', visibility: 'hide', context_window: 3000 },
    ]
  }, { defaultContextWindow: 262144, defaultMaxTokens: 32768, defaultInput: ['text'] })
  assert.deepEqual(models.map((model) => model.id), ['visible'])
})

test('builds the Codex-compatible catalog URL', () => {
  assert.equal(
    catalogURL('http://127.0.0.1:8317/v1/'),
    'http://127.0.0.1:8317/v1/models?client_version=dsh-cliproxyapi-provider',
  )
})

test('rejects malformed and empty catalogs', () => {
  assert.throws(() => readCodexCatalog({ data: [] }), /no "models" array/)
  assert.throws(() => readCodexCatalog({ models: [] }), /no usable models/)
})

test('discovery preserves every CPA field without adding metadata to inference profiles', () => {
  const entry = {
    slug: 'rich-model', display_name: 'Rich Model', context_length: 128000,
    max_output_tokens: 16000, input_modalities: ['text', 'image', 'audio'],
    supported_reasoning_levels: [{ effort: 'low', description: 'Faster' }, { effort: 'xhigh', description: 'Thorough' }],
    default_reasoning_level: 'low', supports_parallel_tool_calls: true,
    extra_capability: { formats: ['json', 'text'], optional: null },
    base_instructions: '<script>not executable</script>',
  }
  const { models, discovery } = readCodexCatalogWithMetadata({ models: [entry] })
  assert.deepEqual(models, [modelProfileOf(entry)])
  assert.equal(models[0].catalogMetadata, undefined)
  assert.deepEqual(discovery[0].catalogMetadata, entry)
  assert.deepEqual(discovery[0].catalogSources, { contextWindow: 'cpa', maxTokens: 'cpa', inputModalities: 'cpa', reasoningEfforts: 'cpa' })
  assert.deepEqual(discovery[0].reasoningEfforts, { low: 'low', xhigh: 'xhigh' })
  assert.deepEqual(discovery[0].inputModalities, ['text', 'image'])
  entry.extra_capability.formats.push('changed')
  assert.deepEqual(discovery[0].catalogMetadata.extra_capability.formats, ['json', 'text'])
})

test('discovery identifies effective defaults rather than claiming they came from CPA', () => {
  const { discovery } = readCodexCatalogWithMetadata({ models: [{ slug: 'minimal', context_window: -1, max_tokens: '100', input_modalities: ['audio'] }] }, {
    defaultContextWindow: 262144, defaultMaxTokens: 32768, defaultInput: ['text'],
  })
  assert.deepEqual(discovery[0].catalogSources, { contextWindow: 'default', maxTokens: 'default', inputModalities: 'default', reasoningEfforts: 'default' })
  assert.equal(discovery[0].contextWindow, 262144)
  assert.deepEqual(discovery[0].catalogMetadata.input_modalities, ['audio'])
})

test('discovery redacts direct secret fields without discarding ordinary metadata', () => {
  const entry = { slug: 'fixture', api_key: 'fixture-secret', extra: { authorization: 'fixture-token', description: 'retained' } }
  const { discovery } = readCodexCatalogWithMetadata({ models: [entry] })
  assert.deepEqual(discovery[0].catalogMetadata, { slug: 'fixture', api_key: '[redacted]', extra: { authorization: '[redacted]', description: 'retained' } })
  assert.equal(entry.api_key, 'fixture-secret')
})

test('explicit capability overrides win while preserving upstream metadata', () => {
  const result = readCodexCatalogWithMetadata({ models: [{ slug: 'model', context_window: 1000, max_output_tokens: 200, input_modalities: ['text'], supported_reasoning_levels: ['low'] }] }, {
    defaultContextWindow: 3000, defaultMaxTokens: 1000, defaultInput: ['text'],
    overrides: { model: { contextWindow: 4000, maxTokens: 500, inputModalities: ['text', 'image'], reasoningEfforts: { high: 'high' } } },
  }).discovery[0]
  assert.equal(result.contextWindow, 4000)
  assert.equal(result.maxTokens, 500)
  assert.deepEqual(result.inputModalities, ['text', 'image'])
  assert.deepEqual(result.reasoningEfforts, { high: 'high' })
  assert.deepEqual(result.catalogSources, { contextWindow: 'override', maxTokens: 'override', inputModalities: 'override', reasoningEfforts: 'override' })
  assert.equal(result.catalogMetadata.context_window, 1000)
})

test('legacy-derived model overrides reach the effective catalog', () => {
  const { discovery } = readCodexCatalogWithMetadata({ models: [{ slug: 'legacy', max_context_window: 1000, supported_reasoning_levels: [{ effort: 'high' }] }] }, {
    defaultContextWindow: 3000, defaultMaxTokens: 500, defaultInput: ['text'],
    overrides: { legacy: { name: 'Legacy', contextWindow: 9000, inputModalities: ['text', 'image'], reasoningEfforts: false, compat: { supportsTemperature: false } } },
  })
  assert.equal(discovery[0].contextWindow, 9000)
  assert.deepEqual(discovery[0].inputModalities, ['text', 'image'])
  assert.equal(discovery[0].reasoningEfforts, undefined)
  assert.deepEqual(discovery[0].compat, { supportsTemperature: false })
})
