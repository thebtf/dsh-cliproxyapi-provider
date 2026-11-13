import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProtocol, terminalStage } from '../src/transport.js'

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
