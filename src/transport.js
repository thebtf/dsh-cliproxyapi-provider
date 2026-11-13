import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'

export function createTransport(baseURL, diagnostics, fetchImpl = globalThis.fetch, keyless = false) {
  const origin = new URL(baseURL).origin
  const native = openAIResponsesApi()
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
          const match = /^(?:event:\s*|data:\s*\{"type"\s*:\s*")(response\.(?:completed|failed|incomplete))/.exec(line)
          if (match && !terminal) { terminal = true; cleanup(); record({ stage: match[1].replace('response.', 'sse-') }) }
        }
      }
      const body = response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) { inspect(decoder.decode(chunk, { stream: true })); controller.enqueue(chunk) },
        flush() { inspect(decoder.decode() + '\n'); cleanup(); if (!terminal) record({ stage: 'sse-incomplete' }) },
      }))
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
    } catch (error) {
      record({ stage: error?.name === 'TimeoutError' ? 'timeout' : error?.name === 'AbortError' ? 'abort' : 'before-http' })
      throw error
    }
  }
  const withPolicy = (options) => ({
    ...options,
    maxRetries: 0,
    fetch: scopedFetch,
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
