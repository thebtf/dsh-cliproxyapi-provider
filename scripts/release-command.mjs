import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
const execute = promisify(execFile)
// Never invoke a shell with tag, package, or file arguments.
export async function run(command, args, options = {}) {
  if (command === 'npm' && process.platform === 'win32') {
    args = [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...args]
    command = process.execPath
  }
  const {stdout} = await execute(command, args, {timeout:300000,maxBuffer:64*1024*1024,encoding:'buffer',...options})
  return stdout
}
