import test from 'node:test'
import assert from 'node:assert/strict'
import { createTransport, resolveProtocol, terminalStage, usesScopedFetch } from '../src/transport.js'

test('an unknown protocol falls back to Responses instead of throwing', () => {
  assert.equal(resolveProtocol('anthropic-messages'), 'anthropic-messages')
  assert.equal(resolveProtocol('not-a-protocol'), 'openai-responses')
  assert.equal(resolveProtocol(undefined), 'openai-responses')
})

test('each protocol recognises its own terminal stream event', () => {
  assert.equal(terminalStage('openai-responses', 'event: response.completed'), 'sse-completed')
  assert.equal(terminalStage('openai-responses', 'event: response.failed'), 'sse-failed')
  assert.equal(terminalStage('openai-completions', 'data: [DONE]'), 'sse-completed')
  assert.equal(terminalStage('openai-completions', 'data: {"error":{"message":"boom"}}'), 'sse-failed')
  assert.equal(terminalStage('anthropic-messages', 'event: message_stop'), 'sse-completed')
  assert.equal(terminalStage('anthropic-messages', 'event: error'), 'sse-failed')
  assert.equal(terminalStage('google-generative-ai', 'data: {"type":"result"}'), 'sse-completed')
  assert.equal(terminalStage('google-generative-ai', 'data: {"type":"error"}'), 'sse-failed')
})

test('a protocol never mistakes another protocol terminal for its own', () => {
  assert.equal(terminalStage('openai-completions', 'event: response.completed'), undefined)
  assert.equal(terminalStage('anthropic-messages', 'data: [DONE]'), undefined)
  assert.equal(terminalStage('openai-responses', 'event: message_stop'), undefined)
  assert.equal(terminalStage('google-generative-ai', 'data: {"type":"message_stop"}'), undefined)
})

test('only the Google protocol skips the scoped fetch it cannot accept', () => {
  assert.equal(usesScopedFetch('google-generative-ai'), false)
  assert.equal(usesScopedFetch('openai-responses'), true)
  assert.equal(usesScopedFetch('openai-completions'), true)
  assert.equal(usesScopedFetch('anthropic-messages'), true)
  assert.equal(usesScopedFetch('not-a-protocol'), true)
})

test('the Google transport streams through the runtime fetch instead of failing', async () => {
  const realFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (input, init) => {
    requests.push({ url: input instanceof Request ? input.url : String(input), hasFetchOption: false })
    const chunk = { candidates: [{ content: { parts: [{ text: 'pong' }] }, finishReason: 'STOP' }] };
    return new Response(`data: ${JSON.stringify(chunk)}\r\n\r\n`, {
      status: 200, headers: { 'content-type': 'text/event-stream' },
    })
  }
  try {
    const diagnostics = []
    const transport = createTransport('google-generative-ai', 'https://gateway.example.com', diagnostics, realFetch, false)
    const model = {
      id: 'gemini-2.5-pro', name: 'gemini-2.5-pro', provider: 'CLIProxyAPI', api: 'google-generative-ai',
      baseUrl: 'https://gateway.example.com/v1beta', input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 1000, maxTokens: 100,
    }
    const stream = transport.streamSimple(model, { messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }] }, { apiKey: 'test-key' })
    for await (const event of stream) { if (event.type === 'error') throw new Error(String(event.error?.errorMessage ?? event.error)) }
    assert.equal(requests.length, 1)
    assert.match(requests[0].url, /\/v1beta\/models\/gemini-2\.5-pro:streamGenerateContent/)
  } finally {
    globalThis.fetch = realFetch
  }
})
