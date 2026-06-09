import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envFiles = ['.env', '.env.example']
let fileEnv: Record<string, string> | null = null

function parseEnvFile(path: string) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        const key = line.slice(0, index).trim()
        let value = line.slice(index + 1).trim()
        // Only remove surrounding quotes if they form a matching pair
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        return [key, value]
      })
  )
}

function readFileEnv() {
  if (fileEnv) return fileEnv

  fileEnv = {}
  for (const file of envFiles) {
    const path = resolve(process.cwd(), file)
    if (existsSync(path)) {
      fileEnv = { ...parseEnvFile(path), ...fileEnv }
    }
  }
  return fileEnv
}

export const testEnv = (key: string): string => process.env[key] ?? readFileEnv()[key] ?? ''

export function testBaseUrl() {
  let port = Number.parseInt(testEnv('PORT') ?? '', 10)
  if (Number.isNaN(port) || port <= 0) port = 3000
  return testEnv('NUXT_PUBLIC_FREE_SITE_DOMAIN') || `http://localhost:${port}`
}

function isWorkersDevHost(hostname: string) {
  return hostname === 'workers.dev' || hostname.endsWith('.workers.dev')
}

// "staging.krabiclaw.com" — the staging platform root. Wildcard TLS only covers
// one subdomain level, so "demo.staging.krabiclaw.com" won't handshake.
// Treat it like workers.dev: use base URL + x-preview-tenant header.
function isStagingRootHost(hostname: string) {
  return /^staging\.[^.]+\.[^.]+$/.test(hostname)
}

// x-preview-tenant carries tenant identity when subdomain routing isn't available
// (workers.dev single-level wildcard, staging root). cache-control: no-store
// prevents edge-cache collisions across tenants.
function previewWorkerHeaders(slug: string): Record<string, string> {
  return { 'x-preview-tenant': slug, 'cache-control': 'no-store' }
}

export function tenantTestBaseUrl() {
  const base = new URL(testBaseUrl())
  if (['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    base.hostname = 'demo.localhost'
    return base.toString().replace(/\/$/, '')
  }
  if (isWorkersDevHost(base.hostname) || isStagingRootHost(base.hostname)) {
    return base.toString().replace(/\/$/, '')
  }
  base.hostname = base.hostname.startsWith('demo.') ? base.hostname : `demo.${base.hostname}`
  return base.toString().replace(/\/$/, '')
}

export function potteryHouseTestBaseUrl() {
  const base = new URL(testBaseUrl())
  if (['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    base.hostname = 'pottery-house.localhost'
    return base.toString().replace(/\/$/, '')
  }
  if (isWorkersDevHost(base.hostname) || isStagingRootHost(base.hostname)) {
    return base.toString().replace(/\/$/, '')
  }
  base.hostname = base.hostname.startsWith('pottery-house.') ? base.hostname : `pottery-house.${base.hostname}`
  return base.toString().replace(/\/$/, '')
}

export function tenantTestExtraHeaders(): Record<string, string> {
  const base = new URL(testBaseUrl())
  return (isWorkersDevHost(base.hostname) || isStagingRootHost(base.hostname))
    ? previewWorkerHeaders('demo')
    : {}
}

export function potteryHouseTestExtraHeaders(): Record<string, string> {
  const base = new URL(testBaseUrl())
  return (isWorkersDevHost(base.hostname) || isStagingRootHost(base.hostname))
    ? previewWorkerHeaders('pottery-house')
    : {}
}

export function devLoginUrl(baseURL: string, userId?: string) {
  const url = new URL('/api/dev/login', baseURL)
  if (userId) url.searchParams.set('userId', userId)
  return url.toString()
}

export function devLoginHeaders(): Record<string, string> | undefined {
  const secret = testEnv('E2E_DEV_ROUTE_SECRET')
  return secret ? { 'x-dev-route-secret': secret } : undefined
}
