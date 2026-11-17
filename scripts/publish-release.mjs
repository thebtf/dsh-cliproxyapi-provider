import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import semver from 'semver'
import { REGISTRY, validateManifest, registryMetadata, verifyRegistry } from './release-artifacts.mjs'
import { run as execute } from './release-command.mjs'

export function distTag(version) {
  if (semver.valid(version) !== version) throw new Error('Invalid version')
  return semver.prerelease(version) ? 'next' : 'latest'
}
export async function publishRelease({manifest, bytes, tarballPath, tag, dryRun = false, run = execute, metadata = registryMetadata, verify = verifyRegistry}) {
  validateManifest(manifest)
  const npmTag = distTag(manifest.version)
  if (dryRun) return {dryRun:true, name:manifest.name, version:manifest.version, distTag:npmTag}
  if (tag !== 'v' + manifest.version) throw new Error('Release tag must match manifest version')
  // This read also refuses manual publication without a pre-existing release.
  const release = JSON.parse((await run('gh', ['release','view',tag,'--json','tagName,isDraft'])).toString())
  if (release.tagName !== tag || release.isDraft !== false) throw new Error('Expected matching published GitHub Release')
  const data = await metadata(manifest, REGISTRY)
  if (data.name !== manifest.name || !data.versions || typeof data.versions !== 'object') throw new Error('Invalid npm package metadata; bootstrap a missing package manually')
  if (!Object.hasOwn(data.versions, manifest.version)) {
    try { await run('npm', ['publish',tarballPath,'--access','public','--provenance','--tag',npmTag,'--registry',REGISTRY,'--ignore-scripts']) }
    catch (error) { console.error('npm publish did not confirm completion; verifying the same version without republishing:', error.message) }
  }
  return verify({manifest,bytes,registry:REGISTRY})
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath,tarballPath,tag,mode] = process.argv.slice(2)
  if (!manifestPath || !tarballPath || (mode && mode !== '--dry-run')) throw new Error('Usage: publish-release.mjs MANIFEST TARBALL TAG [--dry-run]')
  const result = await publishRelease({manifest:JSON.parse(await readFile(manifestPath)), bytes:await readFile(tarballPath),tarballPath,tag,dryRun:mode === '--dry-run'})
  await writeFile(tarballPath + '.verified.json',JSON.stringify(result,null,2) + '\n')
  console.log(JSON.stringify(result))
}
