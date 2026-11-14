import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { ConnectionError, validateEndpoint } from './connection.js'

// A connection snapshot that only this plugin owns. The settings row lives in
// the profile patch file and can disappear when the host profile is rebuilt, a
// row is denied by a core-compatibility gate, or the user reinstalls the
// bundle. The snapshot is the reconnect source of truth for those cases.
const MAX_SNAPSHOT_BYTES = 256 * 1024
const IDENTITY_TYPES = new Set(['none', 'reference', 'record'])

function snapshotPath(documentPath) {
  // Keyed by the profile, not by the profile path: a rebuilt profile has a new
  // patch file path but keeps its name, so the snapshot must survive the rebuild.
  const profile = documentPath ? basename(dirname(documentPath)) : 'default'
  const name = /^[\w.-]{1,64}$/.test(profile) ? profile : createHash('sha256').update(profile).digest('hex').slice(0, 16)
  return dshHomePath('llm-cliproxyapi', name + '.json')
}

function validIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return false
  if (!IDENTITY_TYPES.has(identity.type)) return false
  if (identity.type === 'reference') return typeof identity.ref === 'string' && identity.ref.length > 0
  if (identity.type === 'record') return typeof identity.key === 'string' && identity.key.length > 0
  return Object.keys(identity).length === 1
}

const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

export function snapshotOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('A connection is required')
  if (typeof value.baseURL !== 'string' || !value.baseURL) throw new TypeError('A connection endpoint is required')
  if (typeof value.generation !== 'string' || !/^[a-f0-9]{64}$/.test(value.generation)) throw new TypeError('A connection generation is required')
  if (!validIdentity(value.authIdentity)) throw new TypeError('A connection identity is required')
  validateEndpoint(value.baseURL)
  if (value.policy !== undefined && !plain(value.policy)) throw new TypeError('A connection policy must be an object')
  if (value.overrides !== undefined && !plain(value.overrides)) throw new TypeError('Connection overrides must be an object')
  if (value.modelSelection !== undefined && (!plain(value.modelSelection) || Object.values(value.modelSelection).some((selected) => typeof selected !== 'boolean'))) throw new TypeError('A model selection must contain booleans')
  return {
    schemaVersion: 1,
    baseURL: value.baseURL,
    authIdentity: structuredClone(value.authIdentity),
    enabled: value.enabled !== false,
    policy: structuredClone(value.policy ?? {}),
    modelSelection: structuredClone(value.modelSelection ?? {}),
    overrides: structuredClone(value.overrides ?? {}),
    generation: value.generation,
    ...(typeof value.operationId === 'string' && value.operationId ? { operationId: value.operationId } : {}),
  }
}

export async function writeConnectionSnapshot(documentPath, value) {
  const snapshot = { ...snapshotOf(value), savedAt: Date.now() }
  const contents = JSON.stringify(snapshot)
  if (Buffer.byteLength(contents) > MAX_SNAPSHOT_BYTES) throw new RangeError('Connection snapshot exceeds 256 KiB')
  const file = snapshotPath(documentPath)
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, file)
  } catch (error) {
    await unlink(temporary).catch(() => { })
    throw error
  }
  return snapshot
}

export async function readConnectionSnapshot(documentPath) {
  let data
  try {
    const handle = await open(snapshotPath(documentPath), 'r')
    try {
      const buffer = Buffer.alloc(MAX_SNAPSHOT_BYTES + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      if (bytesRead > MAX_SNAPSHOT_BYTES) return undefined
      data = buffer.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
  let value
  try { value = JSON.parse(data.toString('utf8')) } catch { return undefined }
  if (!value || value.schemaVersion !== 1 || !Number.isFinite(value.savedAt)) return undefined
  try { return snapshotOf(value) } catch { return undefined }
}

export async function removeConnectionSnapshot(documentPath) {
  try { await unlink(snapshotPath(documentPath)); return true } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw new ConnectionError('SNAPSHOT_UNAVAILABLE', 'Connection snapshot could not be removed')
  }
}
