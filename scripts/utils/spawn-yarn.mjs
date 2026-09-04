import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function resolveYarnCommand(args, env = process.env) {
  const npmExecPath = env.npm_execpath
  if (npmExecPath && /\.(?:cjs|mjs|js)$/i.test(npmExecPath) && existsSync(npmExecPath)) {
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

export function spawnYarn(args, options = {}) {
  const invocation = resolveYarnCommand(args.map(arg => String(arg)))
  const normalizedOptions = Object.keys(options).length === 0 ? { stdio: 'inherit' } : options
  return spawnSync(invocation.command, invocation.args, {
    cwd: process.cwd(),
    ...normalizedOptions,
    shell: invocation.shell,
  })
}
