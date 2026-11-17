import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { verifyRegistry, REGISTRY } from './release-artifacts.mjs'
import { run } from './release-command.mjs'

export async function planAssets(wanted, existing, download) {
  const missing=[]
  for (const asset of wanted) {
    const matches=existing.filter(item=>item.name===asset.name)
    if (matches.length>1) throw new Error('Duplicate existing asset: '+asset.name)
    if (!matches.length) missing.push(asset)
    else if (!asset.bytes.equals(await download(matches[0]))) throw new Error('Existing asset bytes conflict: '+asset.name)
  }
  return missing
}
export async function attachRecovery({manifest,bytes,tarballPath,tag,repository,dryRun=false}) {
  if (dryRun) return {dryRun:true}
  if (tag!=='v'+manifest.version || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid release tag or repository')
  const verified=await verifyRegistry({manifest,bytes,registry:REGISTRY})
  const release=JSON.parse((await run('gh',['api','repos/'+repository+'/releases/tags/'+encodeURIComponent(tag)])).toString())
  if (release.tag_name!==tag || release.draft) throw new Error('Expected matching published GitHub Release')
  const list=async()=>JSON.parse((await run('gh',['api','--paginate','--slurp','repos/'+repository+'/releases/'+release.id+'/assets?per_page=100'])).toString()).flat()
  const download=asset=>run('gh',['api','repos/'+repository+'/releases/assets/'+asset.id,'-H','Accept: application/octet-stream'])
  const checksum=Buffer.from(verified.sha256+'  '+basename(tarballPath)+'\n')
  const wanted=[{name:basename(tarballPath),bytes,path:tarballPath},{name:basename(tarballPath)+'.sha256',bytes:checksum,path:tarballPath+'.sha256'}]
  const missing=await planAssets(wanted,await list(),download)
  for (const asset of missing) {
    if (asset.path!==tarballPath) await writeFile(asset.path,asset.bytes)
    // No --clobber. A concurrent upload fails rather than replacing recovery data.
    await run('gh',['release','upload',tag,asset.path,'--repo',repository])
  }
  if ((await planAssets(wanted,await list(),download)).length) throw new Error('Recovery asset upload was not visible; rerun with the same artifact')
  return verified
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath,tarballPath,tag,repository,mode]=process.argv.slice(2)
  if (!manifestPath || !tarballPath || !tag || !repository || (mode && mode!=='--dry-run')) throw new Error('Usage: recovery-assets.mjs MANIFEST TARBALL TAG REPOSITORY [--dry-run]')
  console.log(JSON.stringify(await attachRecovery({manifest:JSON.parse(await readFile(manifestPath)),bytes:await readFile(tarballPath),tarballPath,tag,repository,dryRun:mode==='--dry-run'})))
}
