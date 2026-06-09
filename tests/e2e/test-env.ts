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

// Returns extra HTTP headers for tests targeting a *.workers.dev preview Worker.
// On workers.dev all tenants share one base URL — x-preview-tenant tells the
// middleware which tenant to resolve (see tenant-resolution.ts preview path).
// cache-control: no-store prevents edge-cache collisions across tenants.
function previewWorkerHeaders(slug: string): Record<string, string> {
  return { 'x-preview-tenant': slug, 'cache-control': 'no-store' }
}

export function tenantTestBaseUrl() {
  const base = new URL(testBaseUrl())
  if (['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    base.hostname = 'demo.localhost'
    return base.toString().replace(/\/$/, '')
  }
  if (isWorkersDevHost(base.hostname)) {
    // *.workers.dev wildcard TLS cert is single-level — constructing
    // demo.<preview>.workers.dev would fail the handshake. Return the base URL;
    // x-preview-tenant header carries the tenant identity instead.
    return base.toString().replace(/\/$/, '')
  }
  if (!base.hostname.startsWith('demo.')) {
    base.hostname = `demo.${base.hostname}`
  }
  return base.toString().replace(/\/$/, '')
}

export function potteryHouseTestBaseUrl() {
  const base = new URL(testBaseUrl())
  if (['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    base.hostname = 'pottery-house.localhost'
    return base.toString().replace(/\/$/, '')
  }
  if (isWorkersDevHost(base.hostname)) {
    return base.toString().replace(/\/$/, '')
  }
  if (!base.hostname.startsWith('pottery-house.')) {
    base.hostname = `pottery-house.${base.hostname}`
  }
  return base.toString().replace(/\/$/, '')
}

export function tenantTestExtraHeaders(): Record<string, string> {
  const base = new URL(testBaseUrl())
  return isWorkersDevHost(base.hostname) ? previewWorkerHeaders('demo') : {}
}

export function potteryHouseTestExtraHeaders(): Record<string, string> {
  const base = new URL(testBaseUrl())
  return isWorkersDevHost(base.hostname) ? previewWorkerHeaders('pottery-house') : {}
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
