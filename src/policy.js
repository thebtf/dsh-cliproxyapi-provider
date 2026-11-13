import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { Config as NativePiAiConfig } from '@deepseek-ai/dsh-llm-pi-ai'
import { ConnectionError } from './connection.js'
import { credentialField } from './secrets.js'

const fields = new Set(['displayName', 'api', 'defaultContextWindow', 'defaultMaxTokens', 'defaultInput', 'headers', 'compat', 'retryPolicy', 'reasoning', 'thinkingBudgets', 'streamIdleTimeoutMs', 'maxRequestImageBytes', 'maxRequestImages', 'imageOffloadCountQuantum', 'requestImagePixelBudget', 'requestImageMaxBytes', 'cacheRetention', 'transport', 'timeoutMs', 'websocketConnectTimeoutMs'])
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const containsCredentials = (v) => object(v) && Object.entries(v).some(([k, x]) => credentialField(k) || containsCredentials(x)) || Array.isArray(v) && v.some(containsCredentials)
export function validatePolicy(policy = {}) {
  try {
    if (!object(policy) || containsCredentials(policy) || Object.keys(policy).some((k) => !fields.has(k))) throw 0
    for (const key of ['defaultContextWindow', 'defaultMaxTokens', 'maxRequestImageBytes', 'maxRequestImages', 'imageOffloadCountQuantum', 'requestImagePixelBudget', 'requestImageMaxBytes']) if (policy[key] !== undefined && (!Number.isSafeInteger(policy[key]) || policy[key] <= 0)) throw 0
    for (const key of ['timeoutMs', 'websocketConnectTimeoutMs']) if (policy[key] !== undefined && (!Number.isSafeInteger(policy[key]) || policy[key] < 0)) throw 0
    if (policy.streamIdleTimeoutMs !== undefined && (!Number.isFinite(policy.streamIdleTimeoutMs) || policy.streamIdleTimeoutMs <= 0 || policy.streamIdleTimeoutMs > 2147483647)) throw 0
    if (policy.imageOffloadCountQuantum > (policy.maxRequestImages ?? 50)) throw 0
    if (policy.defaultInput !== undefined && (!Array.isArray(policy.defaultInput) || !policy.defaultInput.length || policy.defaultInput.some((x) => !['text', 'image'].includes(x)))) throw 0
    if (policy.headers !== undefined && (!object(policy.headers) || Object.values(policy.headers).some((x) => typeof x !== 'string'))) throw 0
    if (policy.compat !== undefined && !object(policy.compat) || policy.thinkingBudgets !== undefined && (!object(policy.thinkingBudgets) || Object.values(policy.thinkingBudgets).some((x) => !Number.isSafeInteger(x) || x < 0))) throw 0
    if (policy.cacheRetention !== undefined && !['none', 'short', 'long'].includes(policy.cacheRetention)) throw 0
    if (policy.transport !== undefined && !['auto', 'sse', 'websocket', 'websocket-cached'].includes(policy.transport)) throw 0
    if (policy.reasoning !== undefined && !['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(policy.reasoning)) throw 0
    if (policy.displayName !== undefined && typeof policy.displayName !== 'string' || policy.api !== undefined && policy.api !== 'openai-responses') throw 0
    if (policy.retryPolicy !== undefined && (!object(policy.retryPolicy) || policy.retryPolicy.backoff !== undefined && !object(policy.retryPolicy.backoff) || policy.retryPolicy.retryableCodes !== undefined && !Array.isArray(policy.retryPolicy.retryableCodes))) throw 0
    resolveRetryPolicy(policy.retryPolicy, 'CPA')
    const checked = NativePiAiConfig['~standard'].validate({
      providers: { 'cpa-policy-validation': { ...policy, api: 'openai-responses', baseURL: 'https://policy.invalid/v1', models: [{ id: 'policy-validation' }] } },
    })
    if (!checked || typeof checked.then === 'function' || checked.issues) throw 0
    const parsed = checked.value.providers.get()['cpa-policy-validation']
    for (const [key, value] of Object.entries(policy.compat ?? {})) {
      if (JSON.stringify(parsed.compat?.[key]) !== JSON.stringify(value)) throw 0
    }
  } catch { throw new ConnectionError('INVALID_POLICY', 'Invalid or unsupported public policy') }
}
