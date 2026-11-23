import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const matrix = new Map([
  ['0.2.2-rc.3', ['4.1.0', '3.19.0']],
  ['0.2.2-rc.5', ['4.1.0', '3.19.0']],
  ['0.2.3-alpha.2', ['4.2.0-alpha.1', '3.20.0-alpha.1']],
])
const corePrefix = '@deepseek-ai/dsh-'
const cordisPackage = '@deepseek-ai/cordis'
const schemaPackage = '@deepseek-ai/schemastery'
const projectFiles = ['.github/workflows', 'client.js', 'cordis.patch.yml', 'details', 'locale', 'market', 'scripts', 'src', 'test']
const packageTest = 'test/package.test.js'
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

function run(command, args, cwd, env = process.env) {
  const { error, status, signal } = spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  if (error) throw error
  assert.equal(status, 0, `${command} ${args.join(' ')} failed (${signal ?? `exit ${status}`})`)
}

function install(cwd) {
  // Do not inherit an alternate registry or npm settings that relax peer resolution.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key)))
  const args = [
    'install', '--registry=https://registry.npmjs.org/',
    '--userconfig', join(cwd, '.compat-user-npmrc'),
    '--globalconfig', join(cwd, '.compat-global-npmrc'),
    '--include=dev', '--ignore-scripts', '--strict-peer-deps', '--engine-strict', '--no-audit', '--no-fund',
  ]
  if (process.platform === 'win32') {
    const cli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
    run(process.execPath, [cli, ...args], cwd, env)
  } else {
    run('npm', args, cwd, env)
  }
}

function testCore(version) {
  const [cordis, schema] = matrix.get(version)
  const runtimePins = new Map([[cordisPackage, cordis], [schemaPackage, schema]])
  const expectedVersion = (name) => runtimePins.get(name) ?? (name.startsWith(corePrefix) ? version : undefined)
  const originalManifest = readFileSync(join(root, 'package.json'))
  const manifest = JSON.parse(originalManifest)
  const directPins = new Map()
  for (const group of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[group] ?? {})) {
      const pin = expectedVersion(name)
      if (pin === undefined) continue
      manifest[group][name] = pin
      directPins.set(name, pin)
    }
  }

  const cwd = mkdtempSync(join(tmpdir(), `dsh-core-compat-${version}-`))
  const manifestPath = join(cwd, 'package.json')
  try {
    console.log(`\n=== DSH ${version} (Node ${process.versions.node}) ===`)
    for (const path of projectFiles) cpSync(join(root, path), join(cwd, path), { recursive: true })
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    install(cwd)

    const { packages } = readJson(join(cwd, 'package-lock.json'))
    for (const [name, pin] of directPins) {
      assert.equal(packages[`node_modules/${name}`]?.version, pin, `direct dependency ${name}`)
    }
    for (const path of Object.keys(packages)) {
      const name = path.replace(/^.*node_modules\//, '')
      const pin = expectedVersion(name)
      if (pin !== undefined) assert.equal(readJson(join(cwd, path, 'package.json')).version, pin, path)
    }
    console.log(`Verified installed DSH ${version}, Cordis ${cordis} and Schemastery ${schema}`)

    // Keep node --test's normal discovery. The distribution contract must see
    // the original manifest, not the exact versions used to resolve this row.
    const relocatedTest = join(cwd, '.compat-package.mjs')
    renameSync(join(cwd, packageTest), relocatedTest)
    try {
      run(process.execPath, ['--test'], cwd)
    } finally {
      renameSync(relocatedTest, join(cwd, packageTest))
      writeFileSync(manifestPath, originalManifest)
      run(process.execPath, ['--test', packageTest], cwd)
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true, maxRetries: 3 })
  }
}

function main(requested) {
  const versions = requested.length ? requested : [...matrix.keys()]
  if (versions.some((version) => !matrix.has(version))) {
    console.error(`Usage: node scripts/check-core-compat.mjs [${[...matrix.keys()].join(' | ')}] …`)
    process.exitCode = 1
    return
  }
  for (const version of versions) {
    try {
      testCore(version)
    } catch (error) {
      console.error(`DSH ${version} compatibility check failed:`, error)
      process.exitCode = 1
    }
  }
}

main(process.argv.slice(2))
