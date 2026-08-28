import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { SUPPORTED_CURRENCIES as CANONICAL_SUPPORTED_CURRENCIES } from '../../shared/currencies.ts'

export function parseMigrationTarget(argv) {
  const value = flag => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const database = value('--database') ?? 'DB'
  const environment = value('--env')
  const output = value('--output')
  const report = value('--report')
  const local = argv.includes('--local')
  const remote = argv.includes('--remote')
  if (local === remote) throw new Error('Pass exactly one of --local or --remote')
  if (remote && !environment) throw new Error('--remote requires an explicit --env staging or --env production')
  if (remote && !['staging', 'production'].includes(environment)) {
    throw new Error('--remote requires --env staging or --env production')
  }
  if (environment && !['preview', 'staging', 'production'].includes(environment)) {
    throw new Error('--env must be preview, staging, or production')
  }
  return { database, environment, output, report, local, remote }
}

export function createD1Query(target) {
  return function query(sql) {
    const args = ['d1', 'execute', target.database]
    if (target.environment && target.environment !== 'production') args.push('--env', target.environment)
    args.push(target.local ? '--local' : '--remote', '--command', sql, '--json')
    const raw = execFileSync('node_modules/.bin/wrangler', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, WRANGLER_LOG_PATH: '/tmp/krabiclaw-product-migration-wrangler.log' },
      maxBuffer: 64 * 1024 * 1024,
    })
    const payload = JSON.parse(raw)
    const result = Array.isArray(payload) ? payload[0] : payload
    if (!result?.success) throw new Error(`D1 query failed: ${JSON.stringify(payload)}`)
    return Array.isArray(result.results) ? result.results : []
  }
}

export function runD1Command(target, sql) {
  const args = ['d1', 'execute', target.database]
  if (target.environment && target.environment !== 'production') args.push('--env', target.environment)
  args.push(target.local ? '--local' : '--remote', '--command', sql, '--json')
  try {
    const raw = execFileSync('node_modules/.bin/wrangler', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, WRANGLER_LOG_PATH: '/tmp/krabiclaw-product-migration-wrangler.log' },
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const payload = JSON.parse(raw)
    const results = Array.isArray(payload) ? payload : [payload]
    const ok = results.length > 0 && results.every(result => result?.success === true)
    return { ok, error: ok ? null : JSON.stringify(payload) }
  } catch (error) {
    const output = [error?.message, error?.stdout, error?.stderr]
      .filter(Boolean)
      .map(value => String(value))
      .join('\n')
    return { ok: false, error: output || 'unknown D1 command failure' }
  }
}

export function d1CommandSucceeds(target, sql) {
  return runD1Command(target, sql).ok
}

export function canonicalJsonLine(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJsonLine).join(',')}]`
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJsonLine(item)}`).join(',')}}`
}

export function canonicalJsonLines(rows) {
  return rows.map(canonicalJsonLine).sort().join('\n') + (rows.length ? '\n' : '')
}

export function sha256JsonLines(rows) {
  return createHash('sha256').update(canonicalJsonLines(rows)).digest('hex')
}

export function checksum(rows) {
  return { count: rows.length, sha256: sha256JsonLines(rows) }
}

export function groupChecksums(rows, keyOf) {
  const groups = new Map()
  for (const row of rows) {
    const key = keyOf(row)
    const values = groups.get(key) ?? []
    values.push(row)
    groups.set(key, values)
  }
  return Object.fromEntries([...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, values]) => [key, checksum(values)]))
}

export function emitReport(report, output) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  if (output) writeFileSync(output, serialized)
  process.stdout.write(serialized)
}

export function normalizeDecimal(value) {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) return null
  const [whole, fraction] = raw.split('.')
  const trimmedFraction = fraction?.replace(/0+$/, '') ?? ''
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole
}

export function isCanonicalSlug(value) {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

export function isDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export function parseJson(value, label, violations) {
  try {
    return JSON.parse(value)
  } catch {
    violations.push(`${label}: invalid JSON`)
    return undefined
  }
}

export const SUPPORTED_CURRENCIES = new Set(CANONICAL_SUPPORTED_CURRENCIES)
