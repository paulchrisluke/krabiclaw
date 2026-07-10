import { spawnSync } from 'node:child_process'

export function spawnYarn(args) {
  const command = process.platform === 'win32' ? 'corepack.cmd' : 'corepack'
  return spawnSync(command, ['yarn', ...args.map(arg => String(arg))], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: false,
  })
}
