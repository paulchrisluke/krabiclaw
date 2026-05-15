import { spawn } from 'node:child_process'

if (!process.argv.includes('--confirm-production')) {
  console.error('Refusing to seed remote REVIEWS_DB without --confirm-production.')
  console.error('Usage: yarn seed:remote --confirm-production')
  process.exit(1)
}

const child = spawn('npx', ['wrangler', 'd1', 'execute', 'REVIEWS_DB', '--remote', '--file', 'seeds/demo.sql'], {
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
