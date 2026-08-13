import { getHeader, getResponseHeader, getResponseStatus, setHeader, type H3Event } from 'h3'
import { errorChainForTelemetry } from '~/server/utils/error-telemetry'

export interface RequestDataMetrics {
  requestId: string
  statementCount: number
  batchRoundTrips: number
  rowsRead: number
  rowsWritten: number
  d1DurationMs: number
  startedAt: number
  phases: Record<string, number>
  resources: Map<string, number>
  finalized: boolean
}

const metricsByEvent = new WeakMap<H3Event, RequestDataMetrics>()
const databaseByEvent = new WeakMap<H3Event, D1Database>()
const databaseTargets = new WeakMap<D1Database, D1Database>()
const statementTargets = new WeakMap<object, { target: object; query: string }>()
const SLOW_D1_QUERY_MS = 1000

type D1MetaSummary = {
  duration?: number
  rows_read?: number
  rows_written?: number
  served_by_region?: string
  served_by_colo?: string
  served_by_primary?: boolean
  total_attempts?: number
  timings?: { sql_duration_ms?: number }
}

export function getRequestDataMetrics(event: H3Event): RequestDataMetrics {
  let metrics = metricsByEvent.get(event)
  if (!metrics) {
    metrics = {
      requestId: getHeader(event, 'x-request-id') || crypto.randomUUID(),
      statementCount: 0,
      batchRoundTrips: 0,
      rowsRead: 0,
      rowsWritten: 0,
      d1DurationMs: 0,
      startedAt: performance.now(),
      phases: {},
      resources: new Map(),
      finalized: false,
    }
    metricsByEvent.set(event, metrics)
  }
  return metrics
}

export function safeRoute(event: H3Event): string {
  const route = event.path || event.node.req.url || '/'

  try {
    return new URL(route, 'http://internal').pathname
  } catch {
    return route.split(/[?#]/, 1)[0] || '/'
  }
}

export function recordRequestPhase(event: H3Event, phase: string, startedAt: number) {
  const metrics = getRequestDataMetrics(event)
  metrics.phases[phase] = (metrics.phases[phase] ?? 0) + performance.now() - startedAt
}

function recordResult(metrics: RequestDataMetrics, value: unknown): D1MetaSummary[] {
  const summaries: D1MetaSummary[] = []
  const results = Array.isArray(value) ? value : [value]
  for (const result of results) {
    if (!result || typeof result !== 'object' || !('meta' in result)) continue
    const meta = (result as { meta?: D1MetaSummary }).meta
    metrics.rowsRead += Number(meta?.rows_read) || 0
    metrics.rowsWritten += Number(meta?.rows_written) || 0
    if (meta) summaries.push(meta)
  }
  return summaries
}

function queryIdentity(query: string) {
  const normalized = query.replace(/\s+/g, ' ').trim()
  const operation = normalized.match(/^([a-z]+)/i)?.[1]?.toUpperCase() ?? 'UNKNOWN'
  const tableMatch = operation === 'INSERT'
    ? normalized.match(/\bINTO\s+["`[]?([\w-]+)/i)
    : operation === 'UPDATE'
      ? normalized.match(/^UPDATE\s+["`[]?([\w-]+)/i)
      : normalized.match(/\bFROM\s+["`[]?([\w-]+)/i)
  return { normalized, operation, table: tableMatch?.[1] ?? null }
}

async function queryFingerprint(normalizedQuery: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedQuery))
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function logD1Query(
  level: 'error' | 'warn',
  event: H3Event,
  query: string,
  statementMethod: string,
  durationMs: number,
  error?: unknown,
  meta: D1MetaSummary[] = [],
) {
  try {
    const metrics = getRequestDataMetrics(event)
    const identity = queryIdentity(query)
    const firstMeta = meta[0]
    console[level]('[d1-query]', JSON.stringify({
      event: error ? 'd1_query_failed' : 'd1_query_slow',
      request_id: metrics.requestId,
      ray_id: getHeader(event, 'cf-ray') ?? null,
      route: safeRoute(event),
      statement_method: statementMethod,
      operation: identity.operation,
      table: identity.table,
      query_fingerprint: await queryFingerprint(identity.normalized),
      duration_ms: Number(durationMs.toFixed(2)),
      d1_meta: firstMeta
        ? {
            duration_ms: firstMeta.duration ?? null,
            sql_duration_ms: firstMeta.timings?.sql_duration_ms ?? null,
            rows_read: firstMeta.rows_read ?? null,
            rows_written: firstMeta.rows_written ?? null,
            served_by_region: firstMeta.served_by_region ?? null,
            served_by_colo: firstMeta.served_by_colo ?? null,
            served_by_primary: firstMeta.served_by_primary ?? null,
            total_attempts: firstMeta.total_attempts ?? null,
          }
        : null,
      error_chain: error ? errorChainForTelemetry(error) : null,
    }))
  } catch {
    // Telemetry must never replace the query outcome.
  }
}

function wrapStatement(statement: object, metrics: RequestDataMetrics, event: H3Event, query: string): object {
  const proxy = new Proxy(statement, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (property === 'bind' && typeof value === 'function') {
        return (...args: unknown[]) => wrapStatement(value.apply(target, args) as object, metrics, event, query)
      }
      if (['first', 'all', 'run', 'raw'].includes(String(property)) && typeof value === 'function') {
        return async (...args: unknown[]) => {
          metrics.statementCount += 1
          const startedAt = performance.now()
          let queryDurationMs = 0
          try {
            const result = await value.apply(target, args)
            queryDurationMs = performance.now() - startedAt
            const meta = recordResult(metrics, result)
            if (queryDurationMs >= SLOW_D1_QUERY_MS) {
              await logD1Query('warn', event, query, String(property), queryDurationMs, undefined, meta)
            }
            return result
          } catch (error) {
            queryDurationMs = performance.now() - startedAt
            await logD1Query('error', event, query, String(property), queryDurationMs, error)
            throw error
          } finally {
            metrics.d1DurationMs += queryDurationMs
          }
        }
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  statementTargets.set(proxy, { target: statement, query })
  return proxy
}

export function instrumentD1(event: H3Event, database: D1Database): D1Database {
  const existing = databaseByEvent.get(event)
  if (existing) return existing
  const metrics = getRequestDataMetrics(event)
  const proxy = new Proxy(database, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (property === 'prepare' && typeof value === 'function') {
        return (...args: unknown[]) => wrapStatement(
          value.apply(target, args) as object,
          metrics,
          event,
          typeof args[0] === 'string' ? args[0] : 'unknown',
        )
      }
      if (property === 'batch' && typeof value === 'function') {
        return async (statements: object[]) => {
          metrics.statementCount += statements.length
          metrics.batchRoundTrips += 1
          const startedAt = performance.now()
          let batchDurationMs = 0
          try {
            const originals = statements.map(statement => statementTargets.get(statement)?.target ?? statement)
            const result = await value.call(target, originals)
            batchDurationMs = performance.now() - startedAt
            recordResult(metrics, result)
            return result
          } catch (error) {
            batchDurationMs = performance.now() - startedAt
            try {
              console.error('[d1-query]', JSON.stringify({
                event: 'd1_batch_failed',
                request_id: metrics.requestId,
                ray_id: getHeader(event, 'cf-ray') ?? null,
                route: safeRoute(event),
                statement_count: statements.length,
                statements: statements.map((statement) => {
                  const query = statementTargets.get(statement)?.query ?? 'unknown'
                  const { operation, table } = queryIdentity(query)
                  return { operation, table }
                }),
                duration_ms: Number(batchDurationMs.toFixed(2)),
                error_chain: errorChainForTelemetry(error),
              }))
            } catch {
              // Telemetry must never replace the batch error.
            }
            throw error
          } finally {
            metrics.d1DurationMs += batchDurationMs
          }
        }
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as D1Database
  databaseByEvent.set(event, proxy)
  databaseTargets.set(proxy, database)
  return proxy
}

export function unwrapInstrumentedD1(database: D1Database): D1Database {
  return databaseTargets.get(database) ?? database
}

export function finalizeRequestMetrics(
  event: H3Event,
  resource: string,
  payload: unknown,
  cacheStatus?: string,
) {
  const metrics = getRequestDataMetrics(event)
  const resolvedCacheStatus =
    cacheStatus
    ?? String(getResponseHeader(event, 'x-bootstrap-cache') ?? 'BYPASS')
  const serializeStartedAt = performance.now()
  const responseBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength
  const serializeDuration = performance.now() - serializeStartedAt
  metrics.resources.set(resource, responseBytes)
  metrics.phases.serialize = (metrics.phases.serialize ?? 0) + serializeDuration
  metrics.finalized = true
  applyMetricHeaders(event, metrics, resolvedCacheStatus)
  return payload
}

export function finalizeTrackedRequestMetrics(event: H3Event, responseBody: unknown) {
  const metrics = metricsByEvent.get(event)
  if (!metrics || metrics.finalized) return

  if (metrics.resources.size === 0 && responseBody !== undefined) {
    const serialized = typeof responseBody === 'string'
      ? responseBody
      : JSON.stringify(responseBody)
    metrics.resources.set(event.path, new TextEncoder().encode(serialized).byteLength)
  }

  metrics.finalized = true
  const response = (event as H3Event & {
    node?: { res?: { headersSent?: boolean; writableEnded?: boolean } }
  }).node?.res
  if (response?.headersSent || response?.writableEnded) {
    return
  }
  applyMetricHeaders(
    event,
    metrics,
    String(getResponseHeader(event, 'x-bootstrap-cache') ?? 'BYPASS'),
  )
}

function applyMetricHeaders(
  event: H3Event,
  metrics: RequestDataMetrics,
  cacheStatus: string,
) {
  const responseBytes = [...metrics.resources.values()].reduce((total, bytes) => total + bytes, 0)
  const totalDuration = performance.now() - metrics.startedAt
  setHeader(event, 'x-request-id', metrics.requestId)
  setHeader(event, 'x-data-cache', cacheStatus)
  setHeader(event, 'x-attempt-count', '1')
  setHeader(event, 'x-d1-query-count', String(metrics.statementCount))
  setHeader(event, 'x-d1-batch-count', String(metrics.batchRoundTrips))
  setHeader(event, 'x-d1-rows-read', String(metrics.rowsRead))
  setHeader(event, 'x-d1-rows-written', String(metrics.rowsWritten))
  setHeader(event, 'x-d1-duration-ms', metrics.d1DurationMs.toFixed(2))
  setHeader(event, 'x-response-bytes', String(responseBytes))
  setHeader(event, 'x-total-duration-ms', totalDuration.toFixed(2))
  const phaseTimings = Object.entries(metrics.phases).map(
    ([name, duration]) => `${name};dur=${duration.toFixed(2)}`,
  )
  setHeader(event, 'server-timing', [
    ...phaseTimings,
    `d1;dur=${metrics.d1DurationMs.toFixed(2)}`,
    `total;dur=${totalDuration.toFixed(2)}`,
  ].join(', '))
}

function responseErrorCode(payload: unknown): string | null {
  if (typeof payload === 'string') {
    try {
      return responseErrorCode(JSON.parse(payload))
    } catch {
      return null
    }
  }
  if (!payload || typeof payload !== 'object') return null
  const error = 'error' in payload ? payload.error : null
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return null
}

export function flushRequestMetrics(event: H3Event, responseBody?: unknown) {
  const metrics = metricsByEvent.get(event)
  if (!metrics) return

  // The afterResponse hook is logging only; setting headers here causes
  // ERR_HTTP_HEADERS_SENT in Nitro.
  if (metrics.resources.size === 0 && responseBody !== undefined) {
    const serialized = typeof responseBody === 'string'
      ? responseBody
      : JSON.stringify(responseBody)
    metrics.resources.set(event.path, new TextEncoder().encode(serialized).byteLength)
  }
  if (!metrics.finalized) {
    metrics.finalized = true
    console.error('[data-request] response was not finalized before beforeResponse', JSON.stringify({
      requestId: metrics.requestId,
      resource: [...metrics.resources.keys()].join(',') || event.path,
    }))
  }
  const cacheStatus = String(getResponseHeader(event, 'x-bootstrap-cache') ?? 'BYPASS')
  const responseBytes = [...metrics.resources.values()].reduce((total, bytes) => total + bytes, 0)
  const status = getResponseStatus(event)
  const errorCode = status >= 400 ? responseErrorCode(responseBody) ?? `HTTP_${status}` : null
  const totalDuration = performance.now() - metrics.startedAt
  console.info('[data-request]', JSON.stringify({
    requestId: metrics.requestId,
    resource: [...metrics.resources.keys()].join(',') || event.path,
    cacheStatus,
    attemptCount: 1,
    statementCount: metrics.statementCount,
    batchRoundTrips: metrics.batchRoundTrips,
    rowsRead: metrics.rowsRead,
    rowsWritten: metrics.rowsWritten,
    d1DurationMs: Number(metrics.d1DurationMs.toFixed(2)),
    responseBytes,
    totalDurationMs: Number(totalDuration.toFixed(2)),
    status,
    errorCode,
  }))
}
