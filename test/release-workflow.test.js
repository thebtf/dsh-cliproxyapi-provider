import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const publish = await import('../scripts/publish-release.mjs')
const recovery = await import('../scripts/recovery-assets.mjs')
const prepare = await import('../scripts/prepare-release.mjs')
const manifest={name:'@thebtf/dsh-cliproxyapi-provider',version:'0.6.0',engines:{dsh:'>=0.2.2-rc.3 <1.0.0'}}
const bytes=Buffer.from('one artifact')
test('publication dry run makes no external calls and needs no tag or release',async()=>{
 assert.equal(typeof publish.publishRelease,'function')
 const no=()=>{throw new Error('external call in dry run')}
 const result=await publish.publishRelease({manifest,bytes,dryRun:true,run:no,metadata:no,verify:no})
 assert.equal(result.dryRun,true)
})
test('stable and prerelease dist-tags explicit; tag mismatch fails before calls',async()=>{
 assert.equal(typeof publish.distTag,'function')
 assert.equal(publish.distTag('0.6.0'),'latest');assert.equal(publish.distTag('0.6.0-rc.1'),'next')
 await assert.rejects(publish.publishRelease({manifest,bytes,tag:'wrong'}),/tag/)
})
test('existing npm version is verified, never republished; mismatched artifact fails',async()=>{
 assert.equal(typeof publish.publishRelease,'function')
 const calls=[]
 const options={manifest,bytes,tag:'v0.6.0',tarballPath:'/tmp/one.tgz',run:async(cmd,args)=>{calls.push([cmd,args]);return JSON.stringify({tagName:'v0.6.0',isDraft:false})},metadata:async()=>({name:manifest.name,versions:{'0.6.0':{}}}),verify:async()=>{throw new Error('integrity mismatch')}}
 await assert.rejects(publish.publishRelease(options),/integrity/)
 assert.equal(calls.some(([cmd])=>cmd==='npm'),false)
})
test('publish uses tested tarball and provenance; ambiguous failure still requires verification',async()=>{
 assert.equal(typeof publish.publishRelease,'function')
 const calls=[];let verified=false
 const result=await publish.publishRelease({manifest,bytes,tag:'v0.6.0',tarballPath:'/tmp/tested.tgz',run:async(cmd,args)=>{calls.push([cmd,args]);if(cmd==='npm')throw new Error('pending publish');return JSON.stringify({tagName:'v0.6.0',isDraft:false})},metadata:async()=>({name:manifest.name,versions:{}}),verify:async()=>{verified=true;return {sha256:'verified'}}})
 assert.deepEqual(calls.find(([cmd])=>cmd==='npm')[1],['publish','/tmp/tested.tgz','--access','public','--provenance','--tag','latest','--registry','https://registry.npmjs.org','--ignore-scripts'])
 assert.equal(verified,true);assert.equal(result.sha256,'verified')
})
test('draft or mismatched GitHub release refuses publication before npm calls',async()=>{
 for(const release of [{tagName:'v0.6.0',isDraft:true},{tagName:'wrong',isDraft:false},{}]) {
  await assert.rejects(publish.publishRelease({manifest,bytes,tag:'v0.6.0',run:async()=>JSON.stringify(release),metadata:async()=>{throw new Error('must not query npm')}}),/published GitHub Release/)
 }
})
test('GitHub recovery verifies every existing asset before uploading any and never clobbers',async()=>{
 assert.equal(typeof recovery.planAssets,'function')
 const wanted=[{name:'one.tgz',bytes},{name:'one.tgz.sha256',bytes:Buffer.from('checksum')}]
 assert.deepEqual(await recovery.planAssets(wanted,[{name:'one.tgz',id:1}],async()=>bytes),[wanted[1]])
 await assert.rejects(recovery.planAssets(wanted,[{name:'one.tgz.sha256',id:2}],async()=>Buffer.from('wrong')),/existing asset/i)
 await assert.rejects(recovery.planAssets(wanted,[{name:'one.tgz',id:1},{name:'one.tgz',id:2}],async()=>bytes),/duplicate/i)
})
test('installed artifact requires manifest identity and exported entrypoints, locales and patch',async t=>{
 assert.equal(typeof prepare.verifyInstalled,'function')
 const dir=await mkdtemp(join(tmpdir(),'release-installed-'));t.after(()=>rm(dir,{recursive:true,force:true}))
 await writeFile(join(dir,'package.json'),JSON.stringify({...manifest,main:'./src/index.js',exports:{'.':'./src/index.js','./client':'./client.js','./locale/*.json':'./locale/*.json','./package.json':'./package.json'},dsh:{bundle:{patch:'./cordis.patch.yml'}}}))
 await assert.rejects(prepare.verifyInstalled(dir,manifest),/ENOENT|missing/)
 await mkdir(join(dir,'src'));await mkdir(join(dir,'locale'))
 for(const file of ['src/index.js','client.js','cordis.patch.yml'])await writeFile(join(dir,file),'')
 await writeFile(join(dir,'locale/en.json'),'{}')
 await prepare.verifyInstalled(dir,manifest)
 await assert.rejects(prepare.verifyInstalled(dir,{...manifest,version:'9.0.0'}),/identity/)
})
test('workflow strict install, single pack orchestration and post-verification PR contracts',async()=>{
 const yaml=await readFile(new URL('../.github/workflows/publish.yml',import.meta.url),'utf8')
 assert.match(yaml,/run: npm ci\s/);assert.doesNotMatch(yaml,/npm ci\s*\|\|/)
 assert.match(yaml,/id-token: write/);assert.match(yaml,/prepare-release\.mjs/)
 assert.match(yaml,/publish-release\.mjs/);assert.match(yaml,/recovery-assets\.mjs/)
 assert.match(yaml,/update-market\.mjs/);assert.match(yaml,/ref: main/)
 assert.match(yaml,/peter-evans\/create-pull-request@/);assert.match(yaml,/add-paths: market\/index.json/)
 assert.doesNotMatch(yaml,/git push.*main|--clobber|npm publish --access/)
 assert.match(yaml,/needs: publish/);assert.match(yaml,/needs: recovery/)
 assert.match(yaml,/inputs.dry_run/);assert.match(yaml,/default: true/)
 assert.match(yaml,/persist-credentials: false/)
})
