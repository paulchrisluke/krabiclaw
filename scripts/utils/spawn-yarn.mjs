import { spawnSync } from 'node:child_process'

export function shellQuote(value) {
  const text = String(value)
  if (process.platform === 'win32') {
    return `"${text
      .replace(/"/g, '\\"')
      .replace(/%/g, '%%')
      .replace(/([&|;<>^])/g, '^$1')}"`
  }
  return /[\s"'\\$`!]/.test(text) ? `'${text.replace(/'/g, `'\\''`)}'` : text
}

export function spawnYarn(args) {
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', `corepack yarn ${args.map(shellQuote).join(' ')}`], {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
  }
  return spawnSync('corepack', ['yarn', ...args], { stdio: 'inherit', cwd: process.cwd() })
}
