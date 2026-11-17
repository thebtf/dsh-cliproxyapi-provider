import { readFile, writeFile, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'
import { REGISTRY, publishedSeconds, validateManifest, verifyRegistry } from './release-artifacts.mjs'

const INDEX_URL = 'https://raw.githubusercontent.com/thebtf/dsh-cliproxyapi-provider/main/market/index.json'
export function validateMarket(index) { parseMarketIndex(index, INDEX_URL); return index }
export function updateMarket(index, manifest, publishedAt) {
  validateMarket(index)
  validateManifest(manifest)
  const publishTimestamp = publishedSeconds(publishedAt)
  const result = structuredClone(index)
  const plugin = result.plugins.find(item => item.name === manifest.name)
  if (!plugin) throw new Error('Release package missing from catalog')
  const entry = { version: manifest.version, publishTimestamp, source: {type:'npm',registry:REGISTRY}, engines: {dsh:manifest.engines.dsh} }
  const existing = plugin.versions.find(item => item.version === manifest.version)
  if (existing) {
    if (!isDeepStrictEqual({...existing, source: {...existing.source, registry: existing.source.registry ?? REGISTRY}}, entry)) throw new Error('Existing catalog version conflict; investigate rather than overwrite')
  } else plugin.versions.unshift(entry)
  validateMarket(result)
  return result
}
export async function updateMarketFile({indexPath, dryRun = false, ...options}) {
  // Never trust a caller-provided receipt: reverify exact npm bytes at this boundary.
  const verified = await verifyRegistry(options)
  const original = await readFile(indexPath, 'utf8')
  const updated = updateMarket(JSON.parse(original), options.manifest, verified.publishedAt)
  const text = JSON.stringify(updated, null, 2) + '\n'
  if (dryRun || text === original) return updated
  const temporary = indexPath + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, text, {flag:'wx'})
    if (await readFile(indexPath, 'utf8') !== original) throw new Error('Catalog changed during verification')
    await rename(temporary, indexPath)
  } finally { await rm(temporary, {force:true}) }
  return updated
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [indexPath, manifestPath, tarballPath, registry, mode] = process.argv.slice(2)
  if (!indexPath || !manifestPath || !tarballPath || !registry || (mode && mode !== '--dry-run')) throw new Error('Usage: update-market.mjs INDEX MANIFEST TARBALL REGISTRY [--dry-run]')
  await updateMarketFile({indexPath,manifest:JSON.parse(await readFile(manifestPath)),bytes:await readFile(tarballPath),registry,dryRun:mode === '--dry-run'})
}
