import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
const artifact = await import('../scripts/release-artifacts.mjs')
const market = await import('../scripts/update-market.mjs')
const bytes = Buffer.from('tested tarball bytes')
const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64')
const manifest = { name: '@thebtf/dsh-cliproxyapi-provider', version: '0.6.0', engines: { dsh: '>=0.2.2-rc.3 <1.0.0' } }
const date = '2026-11-17T12:00:00.000Z'
const index = JSON.parse(await readFile(new URL('../market/index.json', import.meta.url)))
test('SHA512 requires exact integrity and byte equality', () => {
  assert.equal(typeof artifact.verifyArtifact, 'function')
  artifact.verifyArtifact(bytes, integrity)
  assert.throws(() => artifact.verifyArtifact(Buffer.from('wrong'), integrity), /integrity/)
  for (const value of ['', 'sha1-abcd', 'sha512-abc']) assert.throws(() => artifact.verifyArtifact(bytes, value), /integrity/)
})
test('catalog update is immutable, exact, engine-aligned and idempotent', () => {
  assert.equal(typeof market.updateMarket, 'function')
  const before = structuredClone(index)
  const other = { ...structuredClone(index.plugins[0]), name: 'other-plugin' }
  before.plugins.push(other)
  const updated = market.updateMarket(before, manifest, date)
  assert.deepEqual(before.plugins[0].versions, index.plugins[0].versions)
  assert.deepEqual(updated.plugins[1], other)
  assert.deepEqual(updated.plugins[0].versions.slice(1), index.plugins[0].versions)
  assert.equal(updated.plugins[0].versions[0].publishTimestamp, Date.parse(date) / 1000)
  assert.deepEqual(updated.plugins[0].versions[0].engines, manifest.engines)
  assert.deepEqual(market.updateMarket(updated, manifest, date), updated)
  assert.throws(() => market.updateMarket(updated, manifest, '2026-11-18T12:00:00.000Z'), /conflict/)
  assert.throws(() => market.updateMarket(updated, { ...manifest, engines: {dsh:'<0.1.0'} }, date), /conflict/)
  for (const bad of [undefined, 'yesterday', '2026-02-30T12:00:00.000Z', 123]) assert.throws(() => market.updateMarket(index, manifest, bad), /timestamp/)
})
test('default registry spelling preserves equivalent existing entry', () => {
 const existing=market.updateMarket(index,manifest,date)
 delete existing.plugins[0].versions[0].source.registry
 assert.deepEqual(market.updateMarket(existing,manifest,date),existing)
 existing.plugins[0].versions[0].source.registry='https://example.com'
 assert.throws(()=>market.updateMarket(existing,manifest,date),/conflict/)
})
test('polling rejects nonfinite bounds before any request',async()=>{
 for(const option of [{delayMs:NaN},{delayMs:Infinity},{timeoutMs:NaN},{timeoutMs:Infinity}]) await assert.rejects(artifact.verifyRegistry({manifest,bytes,...option}),/bounded/)
})
test('full real DSH parser rejects unrelated invalid source, duplicate version and timestamp', () => {
  assert.equal(typeof market.validateMarket, 'function')
  market.validateMarket(index)
  for (const mutate of [v => {v.source.type = 'file'}, v => {v.publishTimestamp = 'bad'}]) {
    const bad = structuredClone(index); mutate(bad.plugins[0].versions[0]); assert.throws(() => market.validateMarket(bad))
  }
  const bad = structuredClone(index); bad.plugins[0].versions.push(bad.plugins[0].versions[0]); assert.throws(() => market.validateMarket(bad))
})
async function fixture(t, handler) {
 const server = createServer(handler); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
 t.after(() => {server.closeAllConnections(); return new Promise(resolve => server.close(resolve))})
 return 'http://127.0.0.1:' + server.address().port
}
function metadata(url) { return { name: manifest.name, versions: { [manifest.version]: { ...structuredClone(manifest), dist: { integrity, tarball: url + '/archive' } } }, time: { [manifest.version]: date } } }
test('registry polling tolerates missing metadata and transient 500 then verifies exact bytes', async t => {
 assert.equal(typeof artifact.verifyRegistry, 'function')
 let requests = 0
 const url = await fixture(t, (req,res) => { if(req.url === '/archive') return res.end(bytes); if (++requests < 3) {res.statusCode = requests === 1 ? 404 : 500; return res.end('pending')} res.end(JSON.stringify(metadata(url))) })
 const result = await artifact.verifyRegistry({ manifest, bytes, registry:url, attempts:3, delayMs:1, timeoutMs:200 })
 assert.equal(result.publishedAt, date); assert.equal(requests,3)
})
for (const mode of ['404','500','json','timeout','truncated','mismatch','identity','timestamp','engines']) test('registry fails closed for ' + mode, async t => {
 assert.equal(typeof artifact.verifyRegistry, 'function')
 const url = await fixture(t, (req,res) => {
  if(mode === 'timeout') return
  if(mode === '404' || mode === '500') {res.statusCode=Number(mode); return res.end('failure')}
  if(mode === 'json') return res.end('{broken')
  if(req.url === '/archive') {if(mode === 'truncated') res.setHeader('Content-Length',1000); return res.end(mode === 'mismatch' ? 'wrong' : bytes)}
  const data=metadata(url)
  if(mode === 'identity') data.versions[manifest.version].name='impostor'
  if(mode === 'timestamp') data.time[manifest.version]='bad'
  if(mode === 'engines') data.versions[manifest.version].engines.dsh='<0.1.0'
  res.end(JSON.stringify(data))
 })
 await assert.rejects(artifact.verifyRegistry({manifest,bytes,registry:url,attempts:2,delayMs:1,timeoutMs:40}))
})
test('failed verification cannot alter catalog file', async t => {
 assert.equal(typeof market.updateMarketFile, 'function')
 const dir=await mkdtemp(join(tmpdir(),'release-test-')); t.after(()=>rm(dir,{recursive:true,force:true}))
 const path=join(dir,'index.json'); const original=JSON.stringify(index); await writeFile(path,original)
 const url=await fixture(t,(req,res)=>{res.statusCode=500;res.end('no')})
 await assert.rejects(market.updateMarketFile({indexPath:path,manifest,bytes,registry:url,attempts:1,timeoutMs:100}))
 assert.equal(await readFile(path,'utf8'),original)
})
test('verified catalog file update supports dry-run and byte-identical repeat', async t => {
 const dir=await mkdtemp(join(tmpdir(),'release-success-'));t.after(()=>rm(dir,{recursive:true,force:true}))
 const path=join(dir,'index.json');const original=JSON.stringify(index);await writeFile(path,original)
 const url=await fixture(t,(req,res)=>res.end(req.url==='/archive'?bytes:JSON.stringify(metadata(url))))
 const options={indexPath:path,manifest,bytes,registry:url,attempts:1,timeoutMs:200}
 const preview=await market.updateMarketFile({...options,dryRun:true})
 assert.equal(await readFile(path,'utf8'),original)
 assert.equal(preview.plugins[0].versions[0].version,manifest.version)
 await market.updateMarketFile(options)
 const first=await readFile(path,'utf8')
 assert.deepEqual(JSON.parse(first),preview)
 await market.updateMarketFile(options)
 assert.equal(await readFile(path,'utf8'),first)
})
