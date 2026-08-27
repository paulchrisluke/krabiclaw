import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'

function hasArgument(args: Record<string, unknown>, key: string) {
  return Object.hasOwn(args, key)
    && args[key] !== undefined
    && args[key] !== null
    && args[key] !== ''
}

function validateUnknownArguments(schema: Record<string, unknown>, value: unknown, path: string) {
  if (Array.isArray(value)) {
    if (!schema.items || typeof schema.items !== 'object' || Array.isArray(schema.items)) return
    value.forEach((item, index) => validateUnknownArguments(schema.items as Record<string, unknown>, item, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return

  const record = value as Record<string, unknown>
  if (schema.additionalProperties === false) {
    const properties = schema.properties && typeof schema.properties === 'object'
      ? schema.properties as Record<string, unknown>
      : {}
    const allowedKeys = new Set(Object.keys(properties))
    const unknownKeys = Object.keys(record).filter(key => !allowedKeys.has(key)).sort()
    if (unknownKeys.length) {
      const names = unknownKeys.map(key => path ? `${path}.${key}` : key)
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        `Unknown argument${names.length > 1 ? 's' : ''}: ${names.join(', ')}`,
      )
    }
  }

  const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
    ? schema.properties as Record<string, unknown>
    : {}
  for (const [key, childSchema] of Object.entries(properties)) {
    if (!Object.hasOwn(record, key) || !childSchema || typeof childSchema !== 'object' || Array.isArray(childSchema)) continue
    validateUnknownArguments(childSchema as Record<string, unknown>, record[key], path ? `${path}.${key}` : key)
  }
}

function canonicalValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalValue(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? String(value)
}

function validateArrayConstraints(schema: Record<string, unknown>, value: unknown, path: string) {
  if (Array.isArray(value)) {
    const label = path || 'value'
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} must contain at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}.`)
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} must contain at most ${schema.maxItems} items.`)
    }
    if (schema.uniqueItems === true) {
      const seen = new Set<string>()
      for (const item of value) {
        const key = canonicalValue(item)
        if (seen.has(key)) {
          throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} must contain unique items.`)
        }
        seen.add(key)
      }
    }
    if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
      value.forEach((item, index) => validateArrayConstraints(schema.items as Record<string, unknown>, item, `${path}[${index}]`))
    }
    return
  }

  if (!value || typeof value !== 'object') return
  const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
    ? schema.properties as Record<string, unknown>
    : {}
  for (const [key, childSchema] of Object.entries(properties)) {
    if (!Object.hasOwn(value, key) || !childSchema || typeof childSchema !== 'object' || Array.isArray(childSchema)) continue
    validateArrayConstraints(childSchema as Record<string, unknown>, (value as Record<string, unknown>)[key], path ? `${path}.${key}` : key)
  }
}

export function validateArguments(schema: Record<string, unknown>, args: Record<string, unknown>) {
  validateUnknownArguments(schema, args, '')
  validateArrayConstraints(schema, args, '')

  if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0) return
  const alternatives = schema.anyOf.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || !Array.isArray((candidate as Record<string, unknown>).required)) {
      return null
    }
    const required = (candidate as { required: unknown[] }).required
    return required.every((key): key is string => typeof key === 'string') ? required : null
  })
  if (alternatives.some(alternative => alternative === null)) return
  const requiredAlternatives = alternatives as string[][]
  if (requiredAlternatives.some(required => required.every(key => hasArgument(args, key)))) return

  throw mcpProtocolError(
    MCP_ERROR.invalidParams,
    `At least one argument set is required: ${requiredAlternatives.map(required => required.join(' + ')).join(' | ')}`,
  )
}
