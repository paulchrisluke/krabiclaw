import { spawn } from 'node:child_process'

if (!process.argv.includes('--confirm-production')) {
  console.error('Refusing to seed remote DB without --confirm-production.')
  console.error('Usage: yarn seed:remote --confirm-production')
  process.exit(1)
}

const targetScript = process.argv.find((arg) => arg.startsWith('scripts/') && arg.endsWith('.ts')) || 'scripts/generate-demo-seed.ts'

const child = spawn('node', ['--experimental-strip-types', targetScript, '--remote'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Remote seed stopped by signal ${signal}.`)
    process.exit(1)
  }
  process.exit(code ?? 1)
})
