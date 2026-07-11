import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

function resolveYarnCommand(args) {
  const npmExecPath = process.env.npm_execpath
  if (npmExecPath && existsSync(npmExecPath)) {
    return {
      command: process.execPath,
      args: [npmExecPath, ...args],
      shell: false,
    }
  }

  const corepackPath = join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js')
  if (existsSync(corepackPath)) {
    return {
      command: process.execPath,
      args: [corepackPath, 'yarn', ...args],
      shell: false,
    }
  }

  return {
    command: process.platform === 'win32' ? 'corepack.cmd' : 'corepack',
    args: ['yarn', ...args],
    shell: process.platform === 'win32',
  }
}

export function spawnYarn(args) {
  const invocation = resolveYarnCommand(args.map(arg => String(arg)))
  return spawnSync(invocation.command, invocation.args, {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: invocation.shell,
  })
}
