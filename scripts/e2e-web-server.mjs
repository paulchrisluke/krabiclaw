import { createWriteStream, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'

const port = process.env.PORT || '3000'
const logDir = resolve(process.cwd(), '.artifacts/e2e')
const logPath = resolve(logDir, 'web-server.log')

mkdirSync(logDir, { recursive: true })

const logStream = createWriteStream(logPath, { flags: 'a' })
const startedAt = new Date().toISOString()

function writeLog(prefix, chunk) {
  const text = chunk.toString()
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    if (!line) continue
    const entry = `[${new Date().toISOString()}] [${prefix}] ${line}\n`
    process.stdout.write(entry)
    logStream.write(entry)
  }
}

const env = {
  ...process.env,
  PORT: port
}

const child = spawn('yarn', ['dev'], {
  cwd: process.cwd(),
  env,
  stdio: ['ignore', 'pipe', 'pipe']
})

writeLog('e2e-web-server', `Starting Nuxt dev server on port ${port}`)
writeLog('e2e-web-server', `Writing logs to ${logPath}`)
writeLog('e2e-web-server', `Started at ${startedAt}`)

child.stdout.on('data', (chunk) => {
  writeLog('stdout', chunk)
})

child.stderr.on('data', (chunk) => {
  writeLog('stderr', chunk)
})

child.on('exit', (code, signal) => {
  writeLog('e2e-web-server', `Nuxt dev server exited with code=${code ?? 'null'} signal=${signal ?? 'null'}`)
  logStream.end(() => {
    process.exit(code ?? 0)
  })
})

child.on('error', (error) => {
  writeLog('e2e-web-server', `Failed to start Nuxt dev server: ${error.message}`)
  logStream.end(() => {
    process.exit(1)
  })
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    writeLog('e2e-web-server', `Received ${signal}, forwarding to Nuxt dev server`)
    if (!child.killed) {
      child.kill(signal)
      return
    }
    logStream.end(() => {
      process.exit(0)
    })
  })
}
