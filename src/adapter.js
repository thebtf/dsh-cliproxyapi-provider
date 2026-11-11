import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { LlmError, resolveImageAttachmentAccess, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { createProvider, InMemoryCredentialStore, defaultProviderAuthContext } from '@earendil-works/pi-ai'
import { createTransport } from './transport.js'
import { resolveIdentity } from './connection.js'

const PROVIDER = 'CLIProxyAPI'
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export function createGatewayAdapter(ctx, snapshot, diagnostics, onMissing = () => { }) {
  let profiles = new Map()
  const update = (next) => {
    const captured = structuredClone(next)
    const models = captured.models.filter((model) => captured.modelSelection?.[model.id] !== false).map((model) => {
      const efforts = model.reasoningEfforts
      const thinkingLevelMap = efforts && Object.fromEntries(LEVELS.flatMap((level) => efforts[level] === undefined ? [[level, null]] : efforts[level] === null ? [] : [[level, efforts[level]]]))
      return {
        id: model.id, name: model.name ?? model.id, provider: PROVIDER, api: 'openai-responses',
        baseUrl: captured.baseURL, reasoning: !!efforts, ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
        input: model.inputModalities ?? model.input ?? ['text'], contextWindow: model.contextWindow,
        maxTokens: model.maxTokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        compat: { ...captured.policy?.compat, ...model.compat, supportsStrictMode: true },
      }
    })
    const piProvider = createProvider({
      id: PROVIDER, name: PROVIDER, baseUrl: captured.baseURL, models,
      auth: { apiKey: { name: 'DSH key resolver', resolve: async ({ credential }) => ({ auth: { apiKey: credential?.key ?? 'cpa-keyless' }, source: 'DSH' }) } },
      api: createTransport(captured.baseURL, diagnostics, globalThis.fetch, captured.authIdentity?.type === 'none'),
    })
    const profile = {
      provider: PROVIDER, displayName: PROVIDER, baseURL: captured.baseURL, piProvider,
      authIdentity: captured.authIdentity, headers: captured.policy?.headers,
      reasoning: captured.policy?.reasoning, thinkingBudgets: captured.policy?.thinkingBudgets,
      cacheRetention: captured.policy?.cacheRetention, transport: captured.policy?.transport,
      timeoutMs: captured.policy?.timeoutMs, websocketConnectTimeoutMs: captured.policy?.websocketConnectTimeoutMs,
      streamIdleTimeoutMs: captured.policy?.streamIdleTimeoutMs ?? 30000,
      maxRequestImageBytes: captured.policy?.maxRequestImageBytes ?? 20 * 1024 * 1024,
      maxRequestImages: captured.policy?.maxRequestImages ?? 50,
      imageOffloadCountQuantum: captured.policy?.imageOffloadCountQuantum ?? Math.min(10, captured.policy?.maxRequestImages ?? 50),
      requestImagePixelBudget: captured.policy?.requestImagePixelBudget ?? 2048 * 2048, requestImageMaxBytes: captured.policy?.requestImageMaxBytes ?? 1024 * 1024,
      retryPolicy: resolveRetryPolicy(captured.policy?.retryPolicy, 'CPA'),
      modelErrors: new Map(), configuredMaxTokens: new Map(),
    }
    profiles = new Map([[PROVIDER, profile]])
  }
  if (snapshot) update(snapshot)
  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: async (_provider, profile) => {
      const value = await resolveIdentity(ctx.credentials, profile.authIdentity)
      if (profile.authIdentity?.type !== 'none' && !value) {
        onMissing()
        throw new LlmError('CPA credential is missing', 'MISSING_CREDENTIAL')
      }
      return value
    },
    auth: { credentials: new InMemoryCredentialStore(), authContext: defaultProviderAuthContext },
    resolveAttachments: () => ctx.get('attachments'),
    resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(attachments, (path) => ctx.get('fs')?.processPathFromHostPath(path), ref),
    onReplayDegrade: () => {
      diagnostics.push({ at: Date.now(), stage: 'replay-degraded' })
      if (diagnostics.length > 50) diagnostics.splice(0, diagnostics.length - 50)
    },
  })
  return { adapter, update }
}
