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

// How long the transport keeps reading a completed stream after the consumer
// already saw its end. Long enough for a middleware in front of the gateway to
// finish its bookkeeping and close the response, short enough that a proxy
// which never closes cannot pin the socket.
export const TERMINAL_DRAIN_MS = 5000

// pi-ai fits maxTokens into the context window with a symbol-based estimate of
// the whole transcript (utils/estimate.ts, CHARS_PER_TOKEN = 3.5). A replayed
// history carries no usage, so that estimate is the only input, and on a long
// transcript it overshoots the window by an order of magnitude, so
// clampMaxTokensToContext (api/simple-options.ts) returns its floor of 1. A
// wire budget of 1 is worse than useless: the compressing middleware in front
// of the gateway sees a client that shrank its own output and restores it to
// 128000-256000, and the model then writes for half an hour until max-tokens.
// The turn should fail on the input side and let the host compact instead, so
// no request leaves with a budget below this floor (capped by the model's own
// ceiling, which keeps a model that truly allows less than the floor honest).
export const MIN_WIRE_MAX_TOKENS = 4096
const MAX_TOKEN_FIELDS = {
  'anthropic-messages': ['max_tokens'],
  'openai-responses': ['max_output_tokens'],
  // openai-completions writes whichever of the two its compat.maxTokensField
  // selects; both are inspected and only a field that is present is raised.
  'openai-completions': ['max_completion_tokens', 'max_tokens'],
  'google-generative-ai': [],
}

export function raiseMaxTokens(api, payload, model) {
  const ceiling = typeof model?.maxTokens === 'number' && model.maxTokens > 0 ? model.maxTokens : MIN_WIRE_MAX_TOKENS
  const target = Math.min(MIN_WIRE_MAX_TOKENS, ceiling)
  const raised = []
  for (const field of MAX_TOKEN_FIELDS[api] ?? []) {
    const value = payload[field]
    if (typeof value !== 'number' || value >= target) continue
    payload[field] = target
    raised.push({ field, from: value, to: target })
  }
  const config = payload.generationConfig
  if (api === 'google-generative-ai' && config && typeof config === 'object' && typeof config.maxOutputTokens === 'number' && config.maxOutputTokens < target) {
    raised.push({ field: 'generationConfig.maxOutputTokens', from: config.maxOutputTokens, to: target })
    payload.generationConfig = { ...config, maxOutputTokens: target }
  }
  return raised.length > 0 ? raised : undefined
}

export function createTransport(protocol, baseURL, diagnostics, fetchImpl = globalThis.fetch, keyless = false, drainMs = TERMINAL_DRAIN_MS) {
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
    // pi-ai cancels its own fetch the moment it stops consuming a stream: its
    // adapter aborts the very signal it handed to the API. A middleware in
    // front of the gateway (a compressing proxy, an accounting proxy) reads
    // that cancellation as an abandoned turn and aborts its own upstream work,
    // so a turn that finished normally is still recorded as a mid-stream
    // disconnect. The wire request therefore keeps its own lifetime: a consumer
    // that leaves after the terminal event is ignored and the tail is read to
    // its end, while a consumer that leaves before it cancels the request for
    // real.
    const consumer = init.signal ?? (input instanceof Request ? input.signal : undefined)
    const upstream = new AbortController()
    let abortRecorded = false
    let sawTerminal = false
    const onAbort = () => {
      if (!abortRecorded) { abortRecorded = true; record({ stage: consumer?.reason?.name === 'TimeoutError' ? 'timeout' : 'abort' }) }
      // Once the stream reached its terminal event the remaining bytes are
      // bookkeeping; letting the consumer stop must not tear the socket down.
      if (!sawTerminal) upstream.abort(consumer?.reason)
    }
    if (consumer?.aborted) onAbort()
    else consumer?.addEventListener('abort', onAbort, { once: true })
    const cleanup = () => consumer?.removeEventListener('abort', onAbort)
    try {
      const headers = new Headers(input instanceof Request ? input.headers : undefined)
      if (init.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value))
      if (keyless) headers.delete('authorization')
      const response = await fetchImpl(input, { ...init, signal: upstream.signal, headers, redirect: 'error' })
      const requestId = response.headers.get('x-request-id')
      record({ stage: 'http', status: response.status, ...(/^[A-Za-z0-9._:-]{1,128}$/.test(requestId ?? '') ? { requestId } : {}) })
      if (!response.body || !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) return response
      let pending = ''
      // A failure event is followed by its payload, so the body is left to the
      // adapter that turns it into an error. A completion event is the last one.
      let endsBody = false
      const decoder = new TextDecoder()
      const inspect = (text) => {
        pending += text
        const lines = pending.split(/\r?\n/)
        pending = lines.pop().slice(-1024)
        for (const line of lines) {
          const stage = terminalOf(line)
          if (stage && !sawTerminal) { sawTerminal = true; cleanup(); record({ stage }); endsBody = stage !== 'sse-failed' }
        }
      }
      // A CPA-compatible proxy is free to keep the socket open after the
      // terminal event (keep-alive comments) instead of closing it. pi-ai reads
      // the body until it ends, so an open socket would hold the turn until the
      // idle watchdog fires. The transport therefore finishes the body itself
      // once the terminal event arrives, exactly as a compliant server would.
      const reader = response.body.getReader()
      // A middleware in front of the gateway treats a client that vanishes
      // mid-response as a cancelled turn and aborts its own upstream work. The
      // consumer stream still ends on the terminal event, but the tail is read
      // to its end in the background first, with a cap so a proxy that never
      // closes cannot hold the socket forever.
      let draining = false
      const drain = () => {
        if (draining) return
        draining = true
        const stop = setTimeout(() => { void reader.cancel().catch(() => {}) }, drainMs)
        if (typeof stop.unref === 'function') stop.unref()
        void (async () => {
          try { while (!(await reader.read()).done) { /* discard the tail */ } } catch { /* socket already gone */ } finally { clearTimeout(stop) }
        })()
      }
      const body = new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read()
            if (done) {
              inspect(decoder.decode() + '\n')
              cleanup()
              if (!sawTerminal) record({ stage: flushStage })
              controller.close()
              return
            }
            inspect(decoder.decode(value, { stream: true }))
            controller.enqueue(value)
            if (endsBody) {
              cleanup()
              drain()
              controller.close()
            }
          } catch (error) {
            cleanup()
            controller.error(error)
          }
        },
        cancel(reason) {
          cleanup()
          // The consumer walked away on its own. Before the terminal event that
          // is a real cancellation of the wire request; after it the drain owns
          // the tail and the socket must stay open.
          if (sawTerminal) return
          upstream.abort(reason)
          void reader.cancel(reason).catch(() => {})
        },
      })
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
    } catch (error) {
      cleanup()
      if (!abortRecorded) record({ stage: error?.name === 'TimeoutError' ? 'timeout' : error?.name === 'AbortError' ? 'abort' : 'before-http' })
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
        const toolCount = Array.isArray(value.tools) ? value.tools.length : 0
        record({ stage: 'payload', toolCount })
        // Only a request that actually left with a broken budget is recorded,
        // so a healthy turn keeps the panel timeline it always had.
        const raised = raiseMaxTokens(api, updated, model)
        if (raised) record({ stage: 'payload-clamped', toolCount, field: raised.map((entry) => entry.field).join(','), from: raised[0].from, to: raised[0].to })
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
