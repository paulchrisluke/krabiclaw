export interface ErrorTelemetryEntry {
  name: string
  message: string
  code?: string
  stack?: string
}

const MAX_ERROR_DEPTH = 4
const MAX_ERROR_MESSAGE_LENGTH = 1000
const MAX_ERROR_STACK_LENGTH = 4000

function redactErrorMessage(value: string): string {
  const redacted = value.replace(/\nparams:[\s\S]*$/i, '\nparams: [redacted]')
  return redacted.length <= MAX_ERROR_MESSAGE_LENGTH
    ? redacted
    : `${redacted.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…[truncated]`
}

function redactErrorStack(value: string): string {
  const redacted = value.replace(/\nparams:[^\n]*/gi, '\nparams: [redacted]')
  return redacted.length <= MAX_ERROR_STACK_LENGTH
    ? redacted
    : `${redacted.slice(0, MAX_ERROR_STACK_LENGTH)}…[truncated]`
}

export function errorChainForTelemetry(error: unknown): ErrorTelemetryEntry[] {
  const chain: ErrorTelemetryEntry[] = []
  const seen = new Set<unknown>()
  let current: unknown = error

  while (current != null && !seen.has(current) && chain.length < MAX_ERROR_DEPTH) {
    seen.add(current)
    const record = typeof current === 'object'
      ? current as { name?: unknown; message?: unknown; code?: unknown; stack?: unknown; cause?: unknown }
      : null
    const message = record && typeof record.message === 'string'
      ? record.message
      : String(current)
    const entry: ErrorTelemetryEntry = {
      name: record && typeof record.name === 'string' ? record.name : typeof current,
      message: redactErrorMessage(message),
    }
    if (record && (typeof record.code === 'string' || typeof record.code === 'number')) {
      entry.code = String(record.code)
    }
    if (record && typeof record.stack === 'string') {
      entry.stack = redactErrorStack(record.stack)
    }
    chain.push(entry)
    current = record?.cause
  }

  return chain
}

export function describeErrorForTelemetry(error: unknown, maxLength = 1000): string {
  const messages = errorChainForTelemetry(error)
    .map(entry => entry.message)
    .filter((message, index, all) => message && all.indexOf(message) === index)
  const combined = messages.join('\nCaused by: ') || 'Unknown error'
  if (combined.length <= maxLength) return combined

  const marker = '\n…[middle truncated]…\n'
  const available = Math.max(0, maxLength - marker.length)
  const headLength = Math.ceil(available / 2)
  return combined.slice(0, headLength) + marker + combined.slice(-Math.floor(available / 2))
}
