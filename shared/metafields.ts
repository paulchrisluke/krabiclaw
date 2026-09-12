/**
 * Typed descriptive product attributes.
 *
 * A definition names an attribute once for a tenant and states its type,
 * constraints and localization eligibility. A value row supplies one product's
 * answer. Adding an eleventh attribute of a supported type is one definition
 * row: no column, no field-specific handler, no localization-registry entry,
 * no rendering branch.
 *
 * This is not a general entity framework. It carries reusable descriptive
 * product attributes and nothing else. Money is `prices`, capacity is
 * `product_sessions`, stock is `inventory_levels`, page-only prose is block
 * content, and integration annotations are `products.metadata`.
 */

export const METAFIELD_VALUE_TYPES = [
  'single_line_text',
  'multi_line_text',
  'integer',
  'boolean',
  'url',
  'list.single_line_text',
] as const

export type MetafieldValueType = typeof METAFIELD_VALUE_TYPES[number]

/** Value types whose content is human-readable prose eligible for translation. */
const TRANSLATABLE_VALUE_TYPES: ReadonlySet<MetafieldValueType> = new Set([
  'single_line_text',
  'multi_line_text',
  'list.single_line_text',
])

export type MetafieldValue = string | number | boolean | string[]

export interface MetafieldValidations {
  /** single_line_text, multi_line_text, url, and each element of a text list. */
  max_length?: number
  /** list.single_line_text only. */
  max_items?: number
  /** Closed set for text values. An empty array is rejected as meaningless. */
  choices?: string[]
  /** integer only. */
  min?: number
  max?: number
}

export interface MetafieldDefinition {
  id: string
  organization_id: string
  namespace: string
  key: string
  name: string
  description: string | null
  value_type: MetafieldValueType
  validations: MetafieldValidations
  localizable: boolean
}

export class MetafieldError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MetafieldError'
  }
}

const NAMESPACE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

/** '<namespace>.<key>' — the stable handle every surface addresses a value by. */
export function metafieldHandle(definition: Pick<MetafieldDefinition, 'namespace' | 'key'>): string {
  return `${definition.namespace}.${definition.key}`
}

const DEFAULT_TEXT_MAX_LENGTH = 1_000
const DEFAULT_MULTILINE_MAX_LENGTH = 10_000
const DEFAULT_LIST_MAX_ITEMS = 100

export function assertMetafieldDefinition(
  definition: Pick<MetafieldDefinition, 'namespace' | 'key' | 'name' | 'value_type' | 'validations' | 'localizable'>,
): void {
  if (!NAMESPACE_KEY_PATTERN.test(definition.namespace)) {
    throw new MetafieldError(`namespace must match ${NAMESPACE_KEY_PATTERN}`)
  }
  if (!NAMESPACE_KEY_PATTERN.test(definition.key)) {
    throw new MetafieldError(`key must match ${NAMESPACE_KEY_PATTERN}`)
  }
  if (definition.name.trim() === '') throw new MetafieldError('name must not be blank')
  if (!METAFIELD_VALUE_TYPES.includes(definition.value_type)) {
    throw new MetafieldError(`unsupported value_type: ${String(definition.value_type)}`)
  }
  const rules = definition.validations
  if (definition.localizable && !TRANSLATABLE_VALUE_TYPES.has(definition.value_type)) {
    throw new MetafieldError(`${definition.value_type} values are not translatable`)
  }
  if (rules.max_items !== undefined && definition.value_type !== 'list.single_line_text') {
    throw new MetafieldError('max_items applies only to list.single_line_text')
  }
  if ((rules.min !== undefined || rules.max !== undefined) && definition.value_type !== 'integer') {
    throw new MetafieldError('min and max apply only to integer')
  }
  if (rules.max_length !== undefined && definition.value_type === 'integer') {
    throw new MetafieldError('max_length does not apply to integer')
  }
  if (rules.max_length !== undefined && definition.value_type === 'boolean') {
    throw new MetafieldError('max_length does not apply to boolean')
  }
  for (const [field, value] of [['max_length', rules.max_length], ['max_items', rules.max_items]] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      throw new MetafieldError(`${field} must be a positive integer`)
    }
  }
  if (rules.min !== undefined && !Number.isSafeInteger(rules.min)) throw new MetafieldError('min must be an integer')
  if (rules.max !== undefined && !Number.isSafeInteger(rules.max)) throw new MetafieldError('max must be an integer')
  if (rules.min !== undefined && rules.max !== undefined && rules.max < rules.min) {
    throw new MetafieldError('max must not be below min')
  }
  if (rules.choices !== undefined) {
    if (!TRANSLATABLE_VALUE_TYPES.has(definition.value_type)) {
      throw new MetafieldError('choices apply only to text value types')
    }
    if (rules.choices.length === 0) throw new MetafieldError('choices must not be empty')
    if (new Set(rules.choices).size !== rules.choices.length) throw new MetafieldError('choices must be distinct')
  }
}

function assertText(value: unknown, rules: MetafieldValidations, fallbackMax: number, label: string): string {
  if (typeof value !== 'string') throw new MetafieldError(`${label} must be a string`)
  if (value.trim() === '') throw new MetafieldError(`${label} must not be blank`)
  const max = rules.max_length ?? fallbackMax
  if (value.length > max) throw new MetafieldError(`${label} must be at most ${max} characters`)
  if (rules.choices && !rules.choices.includes(value)) {
    throw new MetafieldError(`${label} must be one of: ${rules.choices.join(', ')}`)
  }
  return value
}

/**
 * The single validation implementation. Imports, CMS, MCP, onboarding and
 * every other mutation path call this — there is no second copy that accepts
 * a value this one would reject.
 */
export function validateMetafieldValue(definition: MetafieldDefinition, value: unknown): MetafieldValue {
  const rules = definition.validations
  switch (definition.value_type) {
    case 'single_line_text': {
      const text = assertText(value, rules, DEFAULT_TEXT_MAX_LENGTH, definition.key)
      if (/[\r\n]/.test(text)) throw new MetafieldError(`${definition.key} must be a single line`)
      return text
    }
    case 'multi_line_text':
      return assertText(value, rules, DEFAULT_MULTILINE_MAX_LENGTH, definition.key)
    case 'url': {
      const text = assertText(value, { max_length: rules.max_length }, DEFAULT_TEXT_MAX_LENGTH, definition.key)
      let parsed: URL
      try { parsed = new URL(text) }
      catch { throw new MetafieldError(`${definition.key} must be an absolute URL`) }
      if (parsed.protocol !== 'https:') throw new MetafieldError(`${definition.key} must use https`)
      if (parsed.username || parsed.password) throw new MetafieldError(`${definition.key} must not carry credentials`)
      return parsed.toString()
    }
    case 'integer': {
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
        throw new MetafieldError(`${definition.key} must be an integer`)
      }
      if (rules.min !== undefined && value < rules.min) throw new MetafieldError(`${definition.key} must be at least ${rules.min}`)
      if (rules.max !== undefined && value > rules.max) throw new MetafieldError(`${definition.key} must be at most ${rules.max}`)
      return value
    }
    case 'boolean':
      if (typeof value !== 'boolean') throw new MetafieldError(`${definition.key} must be a boolean`)
      return value
    case 'list.single_line_text': {
      if (!Array.isArray(value)) throw new MetafieldError(`${definition.key} must be a list`)
      const max = rules.max_items ?? DEFAULT_LIST_MAX_ITEMS
      if (value.length > max) throw new MetafieldError(`${definition.key} must have at most ${max} entries`)
      const items = value.map((entry, index) => {
        const text = assertText(entry, rules, DEFAULT_TEXT_MAX_LENGTH, `${definition.key}[${index}]`)
        if (/[\r\n]/.test(text)) throw new MetafieldError(`${definition.key}[${index}] must be a single line`)
        return text
      })
      if (new Set(items).size !== items.length) throw new MetafieldError(`${definition.key} entries must be distinct`)
      return items
    }
  }
}

/**
 * The one attribute the price surfaces read: a product priced in words.
 *
 * A market-price product carries no numeric price and states this note
 * instead; the page renders the note where an amount would be. The two are
 * mutually exclusive, and a product with neither shows no price at all — a
 * missing amount never becomes zero, "Free", or "Market price" by inference.
 */
export const PRICING_NOTE_HANDLE = 'pricing.note'

/** Values are stored as JSON so a typed list stays a list, not a joined string. */
export function serializeMetafieldValue(definition: MetafieldDefinition, value: unknown): string {
  return JSON.stringify(validateMetafieldValue(definition, value))
}

export function parseMetafieldValue(definition: MetafieldDefinition, stored: string): MetafieldValue {
  let parsed: unknown
  try { parsed = JSON.parse(stored) }
  catch { throw new MetafieldError(`${metafieldHandle(definition)} value is not valid JSON`) }
  return validateMetafieldValue(definition, parsed)
}

/**
 * Whether a definition's values may be translated. The localization machinery
 * reads this; it keeps no list of attribute names of its own.
 */
export function isMetafieldLocalizable(definition: Pick<MetafieldDefinition, 'value_type' | 'localizable'>): boolean {
  return definition.localizable && TRANSLATABLE_VALUE_TYPES.has(definition.value_type)
}
