import { createHash } from 'node:crypto'
import { credentialKey, credentialRef } from '@deepseek-ai/dsh-credentials'

const NS = 'llm-cliproxyapi'

export class ConnectionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ConnectionError'
    this.code = code
  }
}

export function validateEndpoint(input) {
  if (typeof input !== 'string' || !input.trim() || input !== input.trim()) throw new ConnectionError('INVALID_URL', 'A valid endpoint is required')
  let parsed
  try { parsed = new URL(input) } catch { throw new ConnectionError('INVALID_URL', 'A valid endpoint is required') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new ConnectionError('INVALID_URL', 'Endpoint must be HTTP or HTTPS without user information or fragment')
  }
  for (const key of parsed.searchParams.keys()) {
    if (/(?:key|secret|token|password|authorization|credential)/i.test(key)) throw new ConnectionError('INVALID_URL', 'Endpoint query may not contain secrets')
  }
  return input
}

function descriptor(settings) {
  const result = settings.describe().find((row) => row.ns === NS)
  if (!result || !Number.isSafeInteger(result.revision)) throw new ConnectionError('SETTINGS_UNAVAILABLE', 'Connection settings are unavailable')
  return result
}

export async function resolveIdentity(credentials, identity) {
  if (identity?.type === 'none') return undefined
  if (identity?.type === 'reference') return (await credentials.resolve(credentialRef(identity.ref)))?.value
  if (identity?.type === 'record') {
    const record = await credentials.readRecord(identity.key)
    return record?.kind === 'api-key' ? record.key : undefined
  }
  throw new ConnectionError('INVALID_AUTH', 'Unknown credential identity')
}

export async function saveConnection(settings, credentials, input) {
  const current = descriptor(settings)
  if (!Number.isSafeInteger(input.expectedRevision)) throw new ConnectionError('SETTINGS_CONFLICT', 'Connection settings have changed')
  if (typeof input.operationId !== 'string' || !input.operationId || input.operationId.length > 256) throw new ConnectionError('INVALID_OPERATION', 'An operation ID is required')
  if (current.value?.operationId === input.operationId) {
    const same = current.value.baseURL === input.baseURL && JSON.stringify(current.value.policy ?? {}) === JSON.stringify(input.policy ?? current.value.policy ?? {}) && Object.entries(input.selectionChanges ?? {}).every(([id, selected]) => current.value.modelSelection?.[id] === selected)
    if (!same) throw new ConnectionError('OPERATION_CONFLICT', 'Operation ID was already used for a different draft')
    const identity = current.value.authIdentity
    if (input.authEdit?.type === 'none' && identity?.type !== 'none' || input.authEdit?.type === 'reference' && (identity?.type !== 'reference' || identity.ref !== input.authEdit.ref) || input.authEdit?.type === 'replace' && (identity?.type !== 'record' || await resolveIdentity(credentials, identity) !== input.authEdit.key)) throw new ConnectionError('OPERATION_CONFLICT', 'Operation ID was already used for a different draft')
    return { revision: current.revision, generation: current.value.generation, operationId: input.operationId }
  }
  if (input.expectedRevision !== current.revision) throw new ConnectionError('SETTINGS_CONFLICT', 'Connection settings have changed')
  const baseURL = validateEndpoint(input.baseURL)
  const previous = current.value ?? {}
  if (input.selectionChanges != null && (typeof input.selectionChanges !== 'object' || Array.isArray(input.selectionChanges) || Object.values(input.selectionChanges).some((v) => typeof v !== 'boolean'))) throw new ConnectionError('INVALID_SELECTION', 'Model selection must contain booleans')
  const edit = input.authEdit
  if (!edit || typeof edit !== 'object') throw new ConnectionError('INVALID_AUTH', 'An explicit authentication action is required')
  let identity
  if (edit.type === 'keep') {
    if (!previous.authIdentity) throw new ConnectionError('INVALID_AUTH', 'There is no existing identity to retain')
    if (previous.baseURL && previous.baseURL !== baseURL && edit.allowEndpointReuse !== true) throw new ConnectionError('AUTH_REUSE_REQUIRED', 'Credential reuse on a new endpoint requires consent')
    identity = previous.authIdentity
  } else if (edit.type === 'none') {
    identity = { type: 'none' }
  } else if (edit.type === 'reference') {
    try { identity = { type: 'reference', ref: credentialRef(edit.ref) } } catch { throw new ConnectionError('INVALID_AUTH', 'Invalid credential reference') }
    if (previous.baseURL && previous.baseURL !== baseURL && previous.authIdentity?.type === 'reference' && previous.authIdentity.ref === identity.ref && edit.allowEndpointReuse !== true) throw new ConnectionError('AUTH_REUSE_REQUIRED', 'Credential reuse on a new endpoint requires consent')
  } else if (edit.type === 'replace') {
    if (typeof edit.key !== 'string' || !edit.key.trim()) throw new ConnectionError('INVALID_AUTH', 'A non-empty key is required')
    const id = 'op-' + createHash('sha256').update(input.operationId).digest('hex')
    const key = credentialKey(NS, id)
    const existing = await credentials.readRecord(key)
    if (existing && (existing.kind !== 'api-key' || existing.key !== edit.key)) throw new ConnectionError('OPERATION_CONFLICT', 'Operation ID already belongs to another credential')
    if (!existing) {
      let record
      try {
        record = await credentials.modifyRecord(key, async (value) => {
          if (value) return undefined
          return { kind: 'api-key', key: edit.key }
        })
      } catch {
        try { record = await credentials.readRecord(key) } catch { }
        if (!record) throw new ConnectionError('UNKNOWN', 'Credential staging outcome is unknown; read state before retrying')
      }
      if (record?.kind !== 'api-key' || record.key !== edit.key) throw new ConnectionError('OPERATION_CONFLICT', 'Operation ID already belongs to another credential')
    }
    identity = { type: 'record', key }
  } else {
    throw new ConnectionError('INVALID_AUTH', 'Unknown authentication action')
  }
  const generation = createHash('sha256').update(input.operationId).update('\0').update(String(current.revision)).digest('hex')
  const values = {
    baseURL, authIdentity: identity, enabled: previous.enabled ?? true,
    policy: input.policy ?? previous.policy ?? {},
    modelSelection: { ...(previous.modelSelection ?? {}), ...(input.selectionChanges ?? {}) },
    operationId: input.operationId, generation,
  }
  const ops = Object.entries(values).map(([key, value]) => ({ op: 'set', path: [key], value }))
  try {
    await settings.mutate(NS, ops, input.expectedRevision)
  } catch (error) {
    if (error?.code === 'SETTINGS_CONFLICT') throw error
    try {
      const after = descriptor(settings)
      if (after.value?.operationId === input.operationId && after.value?.generation === generation) return { revision: after.revision, generation, operationId: input.operationId }
    } catch { }
    throw new ConnectionError('UNKNOWN', 'Save outcome is unknown; read state before retrying')
  }
  const after = descriptor(settings)
  if (after.value?.operationId !== input.operationId || after.value?.generation !== generation) throw new ConnectionError('UNKNOWN', 'Save outcome is unknown; read state before retrying')
  return { revision: after.revision, generation, operationId: input.operationId }
}
