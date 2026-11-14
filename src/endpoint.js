// One stored endpoint cannot be correct for every protocol: each SDK appends
// its own path to the base URL it is given. Measured against the bundled pi-ai
// clients (anthropic-messages appends "/v1/messages", the OpenAI clients append
// "/chat/completions" and "/responses", Google appends "{model}:generateContent"
// with an empty apiVersion), so the same stored value produced
// POST /v1/v1/messages for an Anthropic route while OpenAI needed the /v1.
//
// The plugin therefore keeps the stored value exactly as the user entered it
// (so snapshots, migration backups and previews keep their identity) and
// derives the per-protocol base at request time from its canonical root:
//
//   catalog               root + /v1/models
//   openai-completions    root + /v1   (SDK appends /chat/completions)
//   openai-responses      root + /v1   (SDK appends /responses)
//   anthropic-messages    root         (SDK appends /v1/messages)
//   google-generative-ai  root + /v1beta (SDK appends /models/<id>:...)
//
// A trailing /v1 or /v1beta is stripped when deriving, so both spellings the
// gateway documents are accepted and a connection saved by an older build keeps
// working unchanged.

const VERSION_SUFFIX = /\/(?:v1|v1beta)$/i

// Append a path suffix before any query string or fragment.
function withPath(root, suffix) {
  const marker = root.search(/[?#]/)
  if (marker < 0) return root + suffix
  return root.slice(0, marker) + suffix + root.slice(marker)
}

export function canonicalEndpoint(input) {
  const value = String(input ?? '').trim()
  if (!value) throw new TypeError('CLIProxyAPI endpoint must not be empty')
  let parsed
  try {
    parsed = new URL(value)
  } catch (error) {
    throw new TypeError('CLIProxyAPI endpoint must be a valid URL', { cause: error })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('CLIProxyAPI endpoint must use http or https')
  }
  const pathname = parsed.pathname.replace(/\/+$/, '')
  // URL turns an empty path into "/", so the root comes back without a slash.
  parsed.pathname = pathname.replace(VERSION_SUFFIX, '') || '/'
  const root = parsed.toString()
  return root === parsed.origin + '/' ? parsed.origin : root.replace(/\/+$/, '')
}

export function baseURLFor(root, api) {
  const canonical = canonicalEndpoint(root)
  if (api === 'anthropic-messages') return canonical
  if (api === 'google-generative-ai') return withPath(canonical, '/v1beta')
  return withPath(canonical, '/v1')
}

export function catalogEndpoint(root) {
  return withPath(canonicalEndpoint(root), '/v1/models')
}
