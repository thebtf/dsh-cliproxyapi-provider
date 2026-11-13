import { createHash } from 'node:crypto'
import { ConnectionError, validateEndpoint } from './connection.js'
import { credentialField } from './secrets.js'
import { PROTOCOLS, validatePolicy } from './policy.js'

const OWN = 'llm-cliproxyapi'
const LEGACY = 'llm-pi-ai'
const PROVIDER = 'CLIProxyAPI'
const fingerprintOf = (profile) => createHash('sha256').update(JSON.stringify(profile)).digest('hex')
const PLACEHOLDER = 'Bearer dsh-cliproxyapi-no-key'
function portableProfile(value) {
  const profile = structuredClone(value)
  if (profile.headers) {
    for (const [key, header] of Object.entries(profile.headers)) {
      if (key.toLowerCase() === 'x-dsh-provider-cpa-sync' || key.toLowerCase() === 'authorization' && header === PLACEHOLDER) delete profile.headers[key]
    }
  }
  return profile
}
function containsSecrets(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, item]) => credentialField(key) || containsSecrets(item))
}
function rows(settings) {
  const entries = settings.describe()
  return { own: entries.find((row) => row.ns === OWN), legacy: entries.find((row) => row.ns === LEGACY) }
}
export function legacyView(settings) {
  const { legacy } = rows(settings)
  const profile = legacy?.user?.providers?.[PROVIDER]
  if (!profile) return { available: false }
  if (legacy.base?.providers?.[PROVIDER]) return { available: false, reason: 'Legacy provider also exists in a base layer' }
  if (!profile.baseURL) return { available: false, reason: 'Legacy endpoint is missing' }
  if (containsSecrets(portableProfile(profile))) return { available: false, reason: 'Legacy provider contains a secret field requiring manual migration' }
  return { available: true, baseURL: profile.baseURL, revision: legacy.revision, fingerprint: fingerprintOf(profile) }
}
async function setOwn(settings, values, revision) {
  await settings.mutate(OWN, Object.entries(values).map(([key, value]) => ({ op: 'set', path: [key], value })), revision)
}
export async function prepareLegacy(settings, input) {
  const { own, legacy } = rows(settings)
  if (!own || !legacy || own.revision !== input.expectedRevision || legacy.revision !== input.expectedLegacyRevision) throw new ConnectionError('SETTINGS_CONFLICT', 'Settings changed before migration')
  if (own.value?.baseURL || own.value?.migration) throw new ConnectionError('MIGRATION_CONFLICT', 'Connection already exists')
  const summary = legacyView(settings)
  if (!summary.available || summary.fingerprint !== input.fingerprint) throw new ConnectionError('MIGRATION_CONFLICT', summary.reason ?? 'Legacy provider changed')
  const profile = portableProfile(legacy.user.providers[PROVIDER])
  validateEndpoint(profile.baseURL)
  if (profile.api !== undefined && !PROTOCOLS.includes(profile.api)) throw new ConnectionError('MIGRATION_UNSUPPORTED', 'Legacy wire protocol cannot be migrated')
  const known = new Set(['displayName', 'api', 'baseURL', 'apiKeyEnv', 'models', 'modelOverrides', 'defaultContextWindow', 'defaultMaxTokens', 'defaultInput', 'headers', 'compat', 'retryPolicy', 'reasoning', 'thinkingBudgets', 'streamIdleTimeoutMs', 'maxRequestImageBytes', 'maxRequestImages', 'imageOffloadCountQuantum', 'requestImagePixelBudget', 'requestImageMaxBytes', 'cacheRetention', 'transport', 'timeoutMs', 'websocketConnectTimeoutMs'])
  if (Object.keys(profile).some((key) => !known.has(key))) throw new ConnectionError('MIGRATION_UNSUPPORTED', 'Legacy provider has unsupported fields')
  if (typeof input.operationId !== 'string' || !input.operationId) throw new ConnectionError('INVALID_OPERATION', 'An operation ID is required')
  const generation = createHash('sha256').update(input.operationId).update('\0').update(String(own.revision)).digest('hex')
  const authIdentity = profile.apiKeyEnv ? { type: 'reference', ref: profile.apiKeyEnv } : { type: 'none' }
  const { baseURL, apiKeyEnv, models, modelOverrides, ...policy } = profile
  validatePolicy(policy)
  const overrides = {}
  for (const model of models ?? []) {
    const { id, input, ...rest } = model
    if (typeof id !== 'string' || !id || Object.keys(rest).some((key) => !['name', 'contextWindow', 'maxTokens', 'reasoningEfforts', 'compat'].includes(key))) throw new ConnectionError('MIGRATION_UNSUPPORTED', 'Legacy model has unsupported fields')
    overrides[id] = { ...rest, ...(input === undefined ? {} : { inputModalities: input }) }
  }
  for (const [id, value] of Object.entries(modelOverrides ?? {})) {
    const { input, ...rest } = value
    if (Object.keys(rest).some((key) => !['name', 'contextWindow', 'maxTokens', 'reasoningEfforts', 'compat'].includes(key))) throw new ConnectionError('MIGRATION_UNSUPPORTED', 'Legacy model override has unsupported fields')
    overrides[id] = { ...overrides[id], ...rest, ...(rest.compat && overrides[id]?.compat ? { compat: { ...overrides[id].compat, ...rest.compat } } : {}), ...(input === undefined ? {} : { inputModalities: input }) }
  }
  const migration = { phase: 'prepared', operationId: input.operationId, generation, legacyRevision: legacy.revision, fingerprint: summary.fingerprint, backupFingerprint: fingerprintOf(profile), backup: profile, provenance: 'legacy' }
  await setOwn(settings, { baseURL, authIdentity, enabled: true, generation, operationId: input.operationId, policy, overrides, migration }, own.revision)
  return migration
}
// Undo a prepared-but-not-cut-over migration. The legacy provider is still in
// place at this point, so only our own row is cleared; rollbackLegacy is for the
// post-cutover case where the legacy entry has to be restored.
export async function discardPrepared(settings) {
  const { own } = rows(settings)
  const migration = own?.value?.migration
  if (!migration || migration.phase !== 'prepared') return false
  if (own.value.generation !== migration.generation) throw new ConnectionError('MIGRATION_CONFLICT', 'Connection changed after migration; forward repair is required')
  await settings.mutate(OWN, ['baseURL', 'authIdentity', 'generation', 'operationId', 'policy', 'overrides', 'migration'].map((key) => ({ op: 'unset', path: [key] })), own.revision)
  return true
}
export async function cutoverLegacy(settings) {
  let { own, legacy } = rows(settings)
  let migration = own?.value?.migration
  if (!migration || !['prepared', 'cutover'].includes(migration.phase)) return false
  const current = legacy?.user?.providers?.[PROVIDER]
  if (legacy?.base?.providers?.[PROVIDER]) throw new ConnectionError('MIGRATION_CONFLICT', 'Legacy provider exists in a base layer')
  if (current && fingerprintOf(current) !== migration.fingerprint) throw new ConnectionError('MIGRATION_CONFLICT', 'Legacy provider changed during migration')
  if (migration.phase === 'prepared') {
    if (!current || legacy.revision !== migration.legacyRevision) throw new ConnectionError('MIGRATION_CONFLICT', 'Legacy provider changed before cutover')
    migration = { ...migration, phase: 'cutover' }
    await setOwn(settings, { migration }, own.revision)
      ; ({ own, legacy } = rows(settings))
  }
  if (legacy?.user?.providers?.[PROVIDER]) await settings.mutate(LEGACY, [{ op: 'unset', path: ['providers', PROVIDER] }], legacy.revision)
    ; ({ legacy } = rows(settings))
  if (legacy?.value?.providers?.[PROVIDER]) throw new ConnectionError('MIGRATION_CONFLICT', 'Legacy provider remains after cutover')
  return true
}
export async function finishLegacy(settings) {
  const { own, legacy } = rows(settings)
  if (own?.value?.migration?.phase !== 'cutover' || legacy?.value?.providers?.[PROVIDER]) throw new ConnectionError('MIGRATION_CONFLICT', 'Legacy cutover is not complete')
  await setOwn(settings, { migration: { ...own.value.migration, phase: 'active' } }, own.revision)
}

export async function rollbackLegacy(settings, releaseRoute) {
  let { own, legacy } = rows(settings)
  const migration = own?.value?.migration
  if (!migration || own.value.generation !== migration.generation) throw new ConnectionError('MIGRATION_CONFLICT', 'Connection changed after migration; forward repair is required')
  let ownedRevision = own.revision
  const checkOwner = () => {
    const current = rows(settings).own
    if (current?.revision !== ownedRevision || current.value?.generation !== migration.generation || current.value?.migration?.operationId !== migration.operationId || current.value?.migration?.generation !== migration.generation) throw new ConnectionError('MIGRATION_CONFLICT', 'Connection changed during rollback; forward repair is required')
  }
  if (legacy?.base?.providers?.[PROVIDER]) throw new ConnectionError('MIGRATION_CONFLICT', 'Legacy provider exists in a base layer')
  if (migration.phase !== 'rollback') {
    if (legacy?.value?.providers?.[PROVIDER] || legacy?.user?.providers?.[PROVIDER]) throw new ConnectionError('MIGRATION_CONFLICT', 'Legacy provider already exists')
    await setOwn(settings, { migration: { ...migration, phase: 'rollback' } }, own.revision)
    ownedRevision += 1
    checkOwner()
  }
  await releaseRoute()
  checkOwner()
    ; ({ own, legacy } = rows(settings))
  const existing = legacy?.user?.providers?.[PROVIDER]
  if (legacy?.base?.providers?.[PROVIDER] || (existing && fingerprintOf(existing) !== migration.backupFingerprint) || (!existing && legacy?.value?.providers?.[PROVIDER])) throw new ConnectionError('MIGRATION_CONFLICT', 'Legacy provider appeared during rollback')
  if (!existing) await settings.mutate(LEGACY, [{ op: 'set', path: ['providers', PROVIDER], value: migration.backup }], legacy.revision)
  checkOwner()
    ; ({ own, legacy } = rows(settings))
  if (!legacy?.user?.providers?.[PROVIDER] || fingerprintOf(legacy.user.providers[PROVIDER]) !== migration.backupFingerprint) throw new ConnectionError('MIGRATION_CONFLICT', 'Legacy rollback could not be confirmed')
  await settings.mutate(OWN, ['baseURL', 'authIdentity', 'generation', 'operationId', 'policy', 'overrides', 'migration'].map((key) => ({ op: 'unset', path: [key] })), ownedRevision)
}
