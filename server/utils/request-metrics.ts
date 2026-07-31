import { getHeader, getResponseHeader, getResponseStatus, setHeader, type H3Event } from 'h3'

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
const statementTargets = new WeakMap<object, object>()

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

export function recordRequestPhase(event: H3Event, phase: string, startedAt: number) {
  const metrics = getRequestDataMetrics(event)
  metrics.phases[phase] = (metrics.phases[phase] ?? 0) + performance.now() - startedAt
}

function recordResult(metrics: RequestDataMetrics, value: unknown) {
  const results = Array.isArray(value) ? value : [value]
  for (const result of results) {
    if (!result || typeof result !== 'object' || !('meta' in result)) continue
    const meta = (result as { meta?: { rows_read?: number; rows_written?: number } }).meta
    metrics.rowsRead += Number(meta?.rows_read) || 0
    metrics.rowsWritten += Number(meta?.rows_written) || 0
  }
}

function wrapStatement(statement: object, metrics: RequestDataMetrics): object {
  const proxy = new Proxy(statement, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (property === 'bind' && typeof value === 'function') {
        return (...args: unknown[]) => wrapStatement(value.apply(target, args) as object, metrics)
      }
      if (['first', 'all', 'run', 'raw'].includes(String(property)) && typeof value === 'function') {
        return async (...args: unknown[]) => {
          metrics.statementCount += 1
          const startedAt = performance.now()
          try {
            const result = await value.apply(target, args)
            recordResult(metrics, result)
            return result
          } finally {
            metrics.d1DurationMs += performance.now() - startedAt
          }
        }
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  statementTargets.set(proxy, statement)
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
        return (...args: unknown[]) => wrapStatement(value.apply(target, args) as object, metrics)
      }
      if (property === 'batch' && typeof value === 'function') {
        return async (statements: object[]) => {
          metrics.statementCount += statements.length
          metrics.batchRoundTrips += 1
          const startedAt = performance.now()
          try {
            const originals = statements.map(statement => statementTargets.get(statement) ?? statement)
            const result = await value.call(target, originals)
            recordResult(metrics, result)
            return result
          } finally {
            metrics.d1DurationMs += performance.now() - startedAt
          }
        }
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as D1Database
  databaseByEvent.set(event, proxy)
  return proxy
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
  applyMetricHeaders(event, metrics, resolvedCacheStatus)
  return payload
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
  if (!metrics || metrics.finalized) return
  metrics.finalized = true
  if (metrics.resources.size === 0 && responseBody !== undefined) {
    const serialized = typeof responseBody === 'string'
      ? responseBody
      : JSON.stringify(responseBody)
    metrics.resources.set(event.path, new TextEncoder().encode(serialized).byteLength)
  }
  const cacheStatus = String(getResponseHeader(event, 'x-bootstrap-cache') ?? 'BYPASS')
  applyMetricHeaders(event, metrics, cacheStatus)
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
