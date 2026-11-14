import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy'
import { PROTOCOLS } from './policy.js'

const FACTORIES = {
  'openai-responses': openAIResponsesApi,
  'openai-completions': openAICompletionsApi,
  'anthropic-messages': anthropicMessagesApi,
  'google-generative-ai': googleGenerativeAIApi,
}

// Each wire protocol ends its SSE stream differently. The scanner only feeds the
// diagnostics panel, so an unknown protocol degrades to "no terminal event seen"
// instead of guessing.
const TERMINALS = {
  'openai-responses': (line) => {
    const match = /^(?:event:\s*|data:\s*\{"type"\s*:\s*")(response\.(?:completed|failed|incomplete))/.exec(line)
    return match ? match[1].replace('response.', 'sse-') : undefined
  },
  'openai-completions': (line) => {
    if (/^data:\s*\[DONE\]/.test(line)) return 'sse-completed'
    return /^data:\s*\{/.test(line) && /"error"\s*:/.test(line) ? 'sse-failed' : undefined
  },
  'anthropic-messages': (line) => {
    const match = /^(?:event:\s*|data:\s*\{[^\n]*"type"\s*:\s*")(message_stop|error)/.exec(line)
    if (!match) return undefined
    return match[1] === 'error' ? 'sse-failed' : 'sse-completed'
  },
  'google-generative-ai': (line) => {
    const match = /^(?:event:\s*|data:\s*\{[^\n]*"type"\s*:\s*")(result|error)/.exec(line)
    if (!match) return undefined
    return match[1] === 'error' ? 'sse-failed' : 'sse-completed'
  },
}

export function resolveProtocol(protocol) {
  return PROTOCOLS.includes(protocol) ? protocol : 'openai-responses'
}

export function terminalStage(protocol, line) {
  return TERMINALS[resolveProtocol(protocol)](line)
}

// The Google Generative AI adapter rejects any fetch that is not globalThis.fetch
// (pi-ai google-generative-ai.js: "Custom fetch is not supported by the Google
// Generative AI adapter"), so that one protocol keeps the runtime fetch and its
// diagnostics panel records no http stage. It also carries its key in
// x-goog-api-key rather than Authorization, so the keyless scrub it would lose
// does not apply to it.
export function usesScopedFetch(api) {
  return resolveProtocol(api) !== 'google-generative-ai'
}

export function createTransport(protocol, baseURL, diagnostics, fetchImpl = globalThis.fetch, keyless = false) {
  const api = resolveProtocol(protocol)
  const origin = new URL(baseURL).origin
  const native = FACTORIES[api]()
  const terminalOf = TERMINALS[api]
  // Google streams carry no sentinel, so a clean flush is a completed stream.
  const flushStage = api === 'google-generative-ai' ? 'sse-completed' : 'sse-incomplete'
  const record = (entry) => {
    diagnostics.push({ at: Date.now(), ...entry })
    if (diagnostics.length > 50) diagnostics.splice(0, diagnostics.length - 50)
  }
  const scopedFetch = async (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input)
    if (new URL(url).origin !== origin) throw new Error('CPA request origin changed')
    try {
      const headers = new Headers(input instanceof Request ? input.headers : undefined)
      if (init.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value))
      if (keyless) headers.delete('authorization')
      const response = await fetchImpl(input, { ...init, headers, redirect: 'error' })
      const requestId = response.headers.get('x-request-id')
      record({ stage: 'http', status: response.status, ...(/^[A-Za-z0-9._:-]{1,128}$/.test(requestId ?? '') ? { requestId } : {}) })
      if (!response.body || !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) return response
      let pending = ''
      let terminal = false
      const signal = init.signal ?? (input instanceof Request ? input.signal : undefined)
      const onAbort = () => { if (!terminal) { terminal = true; record({ stage: signal?.reason?.name === 'TimeoutError' ? 'timeout' : 'abort' }) } }
      if (signal?.aborted) onAbort()
      else signal?.addEventListener('abort', onAbort, { once: true })
      const cleanup = () => signal?.removeEventListener('abort', onAbort)
      const decoder = new TextDecoder()
      const inspect = (text) => {
        pending += text
        const lines = pending.split(/\r?\n/)
        pending = lines.pop().slice(-1024)
        for (const line of lines) {
          const stage = terminalOf(line)
          if (stage && !terminal) { terminal = true; cleanup(); record({ stage }) }
        }
      }
      const body = response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) { inspect(decoder.decode(chunk, { stream: true })); controller.enqueue(chunk) },
        flush() { inspect(decoder.decode() + '\n'); cleanup(); if (!terminal) record({ stage: flushStage }) },
      }))
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
    } catch (error) {
      record({ stage: error?.name === 'TimeoutError' ? 'timeout' : error?.name === 'AbortError' ? 'abort' : 'before-http' })
      throw error
    }
  }
  // The Google Generative AI adapter refuses any fetch that is not globalThis.fetch,
  // so for that protocol the scoped wrapper cannot be installed: the call goes out
  // through the runtime fetch and the diagnostics panel records no http stage. The
  // origin guard is not needed there because the base URL is the one we publish.
  const withPolicy = (options) => ({
    ...options,
    maxRetries: 0,
    ...(usesScopedFetch(api) ? { fetch: scopedFetch } : {}),
    onPayload(payload, model) {
      const applyPolicy = (value) => {
        const updated = { ...value }
        if (Array.isArray(value.tools)) updated.tools = value.tools.map((tool) => tool.type === 'function' ? { ...tool, strict: false } : tool)
        record({ stage: 'payload', toolCount: Array.isArray(value.tools) ? value.tools.length : 0 })
        return updated
      }
      const original = options?.onPayload?.(payload, model)
      return original instanceof Promise ? original.then((value) => applyPolicy(value ?? payload)) : applyPolicy(original ?? payload)
    },
  })
  return {
    stream: (model, context, options) => native.stream(model, context, withPolicy(options)),
    streamSimple: (model, context, options) => native.streamSimple(model, context, withPolicy(options)),
  }
}
