import { readFile, writeFile, mkdir, mkdtemp, rm, readdir, stat, appendFile } from 'node:fs/promises'
import { dirname, join, resolve, relative, isAbsolute, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { validateManifest, verifyArtifact } from './release-artifacts.mjs'
import { run } from './release-command.mjs'

export async function verifyInstalled(root, expected) {
  const manifest = JSON.parse(await readFile(join(root,'package.json')))
  if (manifest.name !== expected.name || manifest.version !== expected.version || !isDeepStrictEqual(manifest.engines,expected.engines)) throw new Error('Installed manifest identity/engines mismatch')
  const targets = new Set([manifest.main,manifest.dsh?.bundle?.patch,'./client.js','./package.json'])
  for (const target of Object.values(manifest.exports ?? {})) {
    if (typeof target !== 'string') throw new Error('Unsupported package export')
    if (!target.includes('*')) targets.add(target)
    else if (target !== './locale/*.json') throw new Error('Unsupported wildcard export')
  }
  const locales = (await readdir(join(root,'locale'))).filter(name => name.endsWith('.json'))
  if (!locales.length) throw new Error('Packaged locales missing')
  for (const name of locales) { JSON.parse(await readFile(join(root,'locale',name))); targets.add('./locale/' + name) }
  for (const target of targets) {
    if (typeof target !== 'string' || !target.startsWith('./') || relative(root,resolve(root,target)).startsWith('..')) throw new Error('Unsafe or missing package entrypoint')
    const path = resolve(root,target)
    if (!(await stat(path)).isFile()) throw new Error('Packaged entrypoint missing: ' + target)
    if (path.endsWith('.js')) await run(process.execPath,['--check',path])
  }
  return manifest
}
export async function prepareRelease(manifestPath, stage) {
  const root=dirname(resolve(manifestPath));stage=resolve(stage)
  const rel=relative(root,stage)
  if (!rel || (!rel.startsWith('..') && !isAbsolute(rel))) throw new Error('Staging directory must be outside the repository')
  const manifest=JSON.parse(await readFile(manifestPath));validateManifest(manifest)
  await mkdir(stage,{recursive:true})
  if ((await readdir(stage)).length) throw new Error('Staging directory must be empty; retain the previous tested artifact instead of repacking')
  const packed=JSON.parse((await run('npm',['pack','--json','--ignore-scripts','--pack-destination',stage],{cwd:root})).toString())
  if (packed.length !== 1 || basename(packed[0].filename) !== packed[0].filename) throw new Error('Expected one safe package tarball')
  const tarball=join(stage,packed[0].filename)
  const bytes=await readFile(tarball);verifyArtifact(bytes,packed[0].integrity)
  const fixture=await mkdtemp(join(tmpdir(),'dsh-release-install-'))
  try {
    await writeFile(join(fixture,'package.json'),JSON.stringify({name:'release-fixture',private:true,type:'module'}))
    await run('npm',['install','--ignore-scripts','--no-audit','--no-fund',tarball],{cwd:fixture})
    await verifyInstalled(join(fixture,'node_modules',...manifest.name.split('/')),manifest)
    if (!bytes.equals(await readFile(tarball))) throw new Error('Tested tarball changed during installation')
  } finally { await rm(fixture,{recursive:true,force:true}) }
  await writeFile(join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,'tarball='+packed[0].filename+'\nversion='+manifest.version+'\n')
  return {tarball,manifest}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath,stage] = process.argv.slice(2)
  if (!manifestPath || !stage || process.argv.length !== 4) throw new Error('Usage: prepare-release.mjs MANIFEST EMPTY_STAGING_DIRECTORY')
  console.log(JSON.stringify(await prepareRelease(manifestPath,stage)))
}
