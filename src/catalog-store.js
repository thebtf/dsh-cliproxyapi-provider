import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { dshCachePath } from '@deepseek-ai/dsh-home-paths'

const MAX_CACHE_BYTES = 8 * 1024 * 1024
const MAX_CATALOG_BYTES = 4 * 1024 * 1024

function cachePath(documentPath, generation) {
  if (typeof documentPath !== 'string' || !documentPath || typeof generation !== 'string' || !/^[a-f0-9]{64}$/.test(generation)) throw new TypeError('A document path and valid generation are required')
  const documentHash = createHash('sha256').update(documentPath).digest('hex')
  return dshCachePath('llm-cliproxyapi', documentHash, `${generation}.json`)
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(?:api[_-]?key|authorization|proxy[_-]?authorization|cookie|set-cookie|password|secret|access[_-]?token|refresh[_-]?token)$/i.test(key) ? '[redacted]' : redact(item)]))
}
function validModels(models) {
  return Array.isArray(models) && models.length > 0 && models.every((model) => model && typeof model === 'object' && !Array.isArray(model) && typeof model.id === 'string' && model.id.length > 0 && typeof model.name === 'string' && Number.isSafeInteger(model.contextWindow) && model.contextWindow > 0 && Number.isSafeInteger(model.maxTokens) && model.maxTokens > 0 && Array.isArray(model.inputModalities) && model.inputModalities.length > 0 && model.inputModalities.every((input) => input === 'text' || input === 'image') && (model.reasoningEfforts === undefined || (model.reasoningEfforts && typeof model.reasoningEfforts === 'object' && !Array.isArray(model.reasoningEfforts) && Object.entries(model.reasoningEfforts).every(([level, wire]) => ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(level) && (typeof wire === 'string' && wire.length > 0 || level === 'off' && wire === null))))) && new Set(models.map((model) => model.id)).size === models.length
}

export async function readCatalogCache(documentPath, generation, baseURL, authIdentity) {
  try {
    const handle = await open(cachePath(documentPath, generation), 'r')
    let data
    try {
      const buffer = Buffer.alloc(MAX_CACHE_BYTES + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      if (bytesRead > MAX_CACHE_BYTES) return undefined
      data = buffer.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
    const value = JSON.parse(data.toString('utf8'))
    if (!value || value.schemaVersion !== 1 || value.generation !== generation || value.baseURL !== baseURL || JSON.stringify(value.authIdentity) !== JSON.stringify(authIdentity) || !Number.isFinite(value.fetchedAt) || !Array.isArray(value.raw) || !validModels(value.effective)) return undefined
    return value
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return undefined
    throw error
  }
}

export async function writeCatalogCache(documentPath, snapshot) {
  const file = cachePath(documentPath, snapshot.generation)
  const raw = redact(snapshot.raw)
  const effective = redact(snapshot.effective)
  if (!Array.isArray(raw) || !validModels(effective)) throw new TypeError('Catalog models are invalid')
  if (Buffer.byteLength(JSON.stringify(raw)) > MAX_CATALOG_BYTES) throw new RangeError('Catalog exceeds 4 MiB')
  const contents = JSON.stringify({ schemaVersion: 1, generation: snapshot.generation, baseURL: snapshot.baseURL, authIdentity: snapshot.authIdentity, fetchedAt: snapshot.fetchedAt, raw, effective })
  if (Buffer.byteLength(contents) > MAX_CACHE_BYTES) throw new RangeError('Catalog cache exceeds 8 MiB')
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, file)
  } catch (error) {
    await unlink(temporary).catch(() => { })
    throw error
  }
}
