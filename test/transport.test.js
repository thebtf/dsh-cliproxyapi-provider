import http from 'node:http'
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

function sseServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      req.resume()
      req.on('end', () => handler(res))
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

function anthropicModel(port) {
  return {
    id: 'm', name: 'm', provider: 'CLIProxyAPI', api: 'anthropic-messages',
    baseUrl: 'http://127.0.0.1:' + port + '/v1', reasoning: false, input: ['text'],
    contextWindow: 100000, maxTokens: 1000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { supportsStrictMode: true },
  }
}

function writeAnthropicTerminal(res) {
  const send = (type, data) => res.write('event: ' + type + '\ndata: ' + JSON.stringify({ type, ...data }) + '\n\n')
  send('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } } })
  send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
  send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'pong' } })
  send('content_block_stop', { index: 0 })
  send('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } })
  send('message_stop', {})
}

test('a proxy that keeps the SSE socket open after the terminal event still ends the stream', async () => {
  let clientClosed = false
  let keepAlive
  const { server, port } = await sseServer((res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    writeAnthropicTerminal(res)
    keepAlive = setInterval(() => { if (!clientClosed) { try { res.write(': keep-alive\n\n') } catch { } } }, 1000)
    res.on('close', () => { clientClosed = true; clearInterval(keepAlive) })
  })
  try {
    const diagnostics = []
    // The drain budget is capped short here so the test proves the cap instead
    // of waiting out the production five seconds.
    const transport = createTransport('anthropic-messages', 'http://127.0.0.1:' + port + '/v1', diagnostics, globalThis.fetch, false, 200)
    const started = Date.now()
    const seen = []
    for await (const event of transport.streamSimple(anthropicModel(port), { messages: [{ role: 'user', content: 'hi' }] }, { apiKey: 'x' })) seen.push(event.type)
    const elapsed = Date.now() - started
    assert.ok(elapsed < 5000, 'the stream must end on the terminal event instead of waiting for the socket, took ' + elapsed + 'ms')
    assert.equal(seen.at(-1), 'done')
    assert.ok(seen.includes('text_delta'))
    assert.deepEqual(diagnostics.map((entry) => entry.stage), ['payload', 'http', 'sse-completed'])
    // The consumer is done, but the upstream socket must stay open for a
    // moment: a middleware in front of the gateway reads that as a completed
    // response instead of a cancelled turn.
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal(clientClosed, false, 'the transport must not hang up the upstream the instant the consumer stops')
    // A proxy that never closes cannot pin the socket either.
    await new Promise((resolve) => setTimeout(resolve, 400))
    assert.equal(clientClosed, true, 'the drain cap must release an upstream that never closes')
  } finally {
    clearInterval(keepAlive)
    await new Promise((resolve) => server.close(resolve))
  }
})

test('the transport reads a completed response to its end so a middleware does not see an aborted turn', async () => {
  let clientClosed = false
  let trailerSent = false
  const { server, port } = await sseServer((res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    writeAnthropicTerminal(res)
    // A real middleware writes its usage trailer after the model finished and
    // only then closes the response.
    setTimeout(() => { if (!clientClosed) { trailerSent = true; try { res.write(': usage\n\n'); res.end() } catch { } } }, 150)
    res.on('close', () => { clientClosed = true })
  })
  try {
    const diagnostics = []
    const transport = createTransport('anthropic-messages', 'http://127.0.0.1:' + port + '/v1', diagnostics, globalThis.fetch, false)
    const seen = []
    for await (const event of transport.streamSimple(anthropicModel(port), { messages: [{ role: 'user', content: 'hi' }] }, { apiKey: 'x' })) seen.push(event.type)
    assert.equal(seen.at(-1), 'done')
    await new Promise((resolve) => setTimeout(resolve, 400))
    assert.equal(trailerSent, true, 'the transport must still be reading when the trailer arrives')
    assert.equal(clientClosed, true, 'the server closed the response after its trailer')
    assert.deepEqual(diagnostics.map((entry) => entry.stage), ['payload', 'http', 'sse-completed'])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
// pi-ai stops consuming as soon as it has the terminal event and aborts the
// signal it handed to the API. A middleware in front of the gateway reads that
// abort as a cancelled turn, so the transport must keep the wire request alive
// on its own until the tail is read.
test('a consumer that stops after the terminal event does not hang up on a middleware', async () => {
  let clientClosed = false
  let trailerSent = false
  const { server, port } = await sseServer((res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    writeAnthropicTerminal(res)
    setTimeout(() => { if (!clientClosed) { trailerSent = true; try { res.write('event: usage\ndata: {"input_tokens":5}\n\n'); res.end() } catch { } } }, 150)
    res.on('close', () => { clientClosed = true })
  })
  try {
    const diagnostics = []
    const transport = createTransport('anthropic-messages', 'http://127.0.0.1:' + port + '/v1', diagnostics, globalThis.fetch, false)
    const caller = new AbortController()
    const seen = []
    for await (const event of transport.streamSimple(anthropicModel(port), { messages: [{ role: 'user', content: 'hi' }] }, { apiKey: 'x', signal: caller.signal })) seen.push(event.type)
    assert.equal(seen.at(-1), 'done')
    // Exactly what the pi-ai adapter does once its consumer is done.
    caller.abort('pi-ai stream consumer stopped')
    await new Promise((resolve) => setTimeout(resolve, 400))
    assert.equal(trailerSent, true, 'the transport must keep reading after the consumer aborted')
    assert.equal(clientClosed, true, 'the server closed the response after its trailer')
    assert.deepEqual(diagnostics.map((entry) => entry.stage), ['payload', 'http', 'sse-completed'])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('a consumer that stops before the terminal event cancels the wire request', async () => {
  let clientClosed = false
  const { server, port } = await sseServer((res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    const send = (type, data) => res.write('event: ' + type + '\ndata: ' + JSON.stringify({ type, ...data }) + '\n\n')
    send('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } } })
    res.on('close', () => { clientClosed = true })
  })
  try {
    const diagnostics = []
    const transport = createTransport('anthropic-messages', 'http://127.0.0.1:' + port + '/v1', diagnostics, globalThis.fetch, false)
    const caller = new AbortController()
    const stream = transport.streamSimple(anthropicModel(port), { messages: [{ role: 'user', content: 'hi' }] }, { apiKey: 'x', signal: caller.signal })
    const iterator = stream[Symbol.asyncIterator]()
    await iterator.next()
    caller.abort('caller cancelled the turn')
    await new Promise((resolve) => setTimeout(resolve, 400))
    assert.equal(clientClosed, true, 'an abandoned turn must release the upstream socket')
    assert.ok(diagnostics.some((entry) => entry.stage === 'abort'), 'the cancellation must still be recorded')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('a stream that ends without a terminal event is recorded as incomplete', async () => {
  const { server, port } = await sseServer((res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    const send = (type, data) => res.write('event: ' + type + '\ndata: ' + JSON.stringify({ type, ...data }) + '\n\n')
    send('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } } })
    res.end()
  })
  try {
    const diagnostics = []
    const transport = createTransport('anthropic-messages', 'http://127.0.0.1:' + port + '/v1', diagnostics, globalThis.fetch, false)
    for await (const event of transport.streamSimple(anthropicModel(port), { messages: [{ role: 'user', content: 'hi' }] }, { apiKey: 'x' })) { if (event.type === 'error') break }
    assert.equal(diagnostics.at(-1).stage, 'sse-incomplete')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
