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

export function tenantTestBaseUrl() {
  const base = new URL(testBaseUrl())
  if (['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    base.hostname = 'demo.localhost'
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
  if (!base.hostname.startsWith('pottery-house.')) {
    base.hostname = `pottery-house.${base.hostname}`
  }
  return base.toString().replace(/\/$/, '')
}

export function devLoginUrl(baseURL: string, userId?: string) {
  const url = new URL('/api/dev/login', baseURL)
  const secret = testEnv('E2E_DEV_ROUTE_SECRET')
  if (secret) url.searchParams.set('secret', secret)
  if (userId) url.searchParams.set('userId', userId)
  return url.toString()
}
