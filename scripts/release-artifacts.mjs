import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import semver from 'semver'

export const REGISTRY = 'https://registry.npmjs.org'
export function verifyArtifact(bytes, integrity) {
  if (typeof integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity)) throw new Error('Invalid SHA-512 integrity')
  const actual = createHash('sha512').update(bytes).digest()
  const expected = Buffer.from(integrity.slice(7), 'base64')
  if (expected.toString('base64') !== integrity.slice(7) || !timingSafeEqual(actual, expected)) throw new Error('Artifact integrity mismatch')
}
export function publishedSeconds(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) throw new Error('Invalid registry timestamp')
  const time = Date.parse(value)
  if (!Number.isFinite(time) || time <= 0 || new Date(time).toISOString() !== value.replace(/(?<=:\d\d)Z$/, '.000Z')) throw new Error('Invalid registry timestamp')
  return Math.floor(time / 1000)
}
export function validateManifest(manifest) {
  if (!manifest || typeof manifest.name !== 'string' || !/^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/.test(manifest.name) || semver.valid(manifest.version) !== manifest.version || !semver.validRange(manifest.engines?.dsh)) throw new Error('Invalid release manifest')
}
export function checkedUrl(value) {
  const url = new URL(value)
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error('Unsafe registry URL')
  return url
}
export async function requestBytes(url, {timeoutMs = 15000, maxBytes = 64 * 1024 * 1024} = {}) {
  checkedUrl(url)
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error', headers: {Accept: 'application/json'} })
  if (!response.ok) { await response.body?.cancel(); const error = new Error('HTTP ' + response.status + ' fetching ' + url); error.status = response.status; throw error }
  const chunks = []; let size = 0
  for await (const chunk of response.body) { size += chunk.length; if (size > maxBytes) throw new Error('Response exceeds byte limit'); chunks.push(chunk) }
  return Buffer.concat(chunks)
}
export async function registryMetadata(manifest, registry = REGISTRY, options = {}) {
  validateManifest(manifest)
  const root = checkedUrl(registry).href.replace(/\/$/, '')
  return JSON.parse((await requestBytes(root + '/' + encodeURIComponent(manifest.name), options)).toString('utf8'))
}
export async function verifyRegistry({manifest, bytes, registry = REGISTRY, attempts = 12, delayMs = 10000, timeoutMs = 15000}) {
  validateManifest(manifest)
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 30 || !Number.isFinite(delayMs) || !Number.isInteger(timeoutMs) || delayMs < 0 || delayMs > 30000 || timeoutMs < 1 || timeoutMs > 60000) throw new Error('Invalid bounded polling options')
  let last
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const metadata = await registryMetadata(manifest, registry, {timeoutMs})
      const version = metadata.versions?.[manifest.version]
      if (!version || !metadata.time?.[manifest.version]) throw new Error('Registry metadata pending')
      if (metadata.name !== manifest.name || version.name !== manifest.name || version.version !== manifest.version || version.engines?.dsh !== manifest.engines.dsh) throw new Error('Registry manifest identity/engines mismatch')
      const publishedAt = metadata.time[manifest.version]
      publishedSeconds(publishedAt)
      verifyArtifact(bytes, version.dist?.integrity)
      const remote = await requestBytes(version.dist.tarball, {timeoutMs, maxBytes: bytes.length + 1})
      verifyArtifact(remote, version.dist.integrity)
      if (!Buffer.from(bytes).equals(remote)) throw new Error('Registry bytes differ from tested artifact')
      return {name:manifest.name, version:manifest.version, publishedAt, integrity:version.dist.integrity, tarball:version.dist.tarball, sha256:createHash('sha256').update(bytes).digest('hex')}
    } catch (error) { last = error }
    if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  throw new Error('Registry verification failed after ' + attempts + ' attempts: ' + last.message, {cause:last})
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, tarballPath, registry, outputPath] = process.argv.slice(2)
  if (!manifestPath || !tarballPath || !registry || !outputPath) throw new Error('Usage: release-artifacts.mjs MANIFEST TARBALL REGISTRY OUTPUT')
  const result = await verifyRegistry({manifest:JSON.parse(await readFile(manifestPath)), bytes:await readFile(tarballPath), registry})
  await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n')
}
