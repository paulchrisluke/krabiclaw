#!/usr/bin/env node

import { spawn } from 'node:child_process'

const portIndex = process.argv.indexOf('--port')
const port = portIndex >= 0 ? process.argv[portIndex + 1] : '3000'
if (!port || !/^\d+$/.test(port)) throw new Error('--port must be followed by a valid port number.')

const origin = `http://localhost:${port}`
const localVars = {
  BETTER_AUTH_URL: origin,
  NUXT_PUBLIC_PLATFORM_DOMAIN: origin,
  NUXT_PUBLIC_FREE_SITE_DOMAIN: origin,
  NUXT_PUBLIC_SITE_URL: origin,
  NUXT_PUBLIC_HELP_URL: `${origin}/help`,
  EMAIL_DELIVERY_MODE: 'log_only',
  WHATSAPP_DELIVERY_MODE: 'log_only',
  DISCORD_DELIVERY_MODE: 'log_only',
}

const args = [
  'wrangler',
  'dev',
  '--local',
  '--port',
  port,
  '--local-upstream',
  `localhost:${port}`,
  '--upstream-protocol',
  'http',
]
for (const [key, value] of Object.entries(localVars)) args.push('--var', `${key}:${value}`)

const child = spawn('yarn', args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
