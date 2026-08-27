export const MAX_D1_JSON_BIND_BYTES = 1_900_000
export const MAX_D1_BATCH_STATEMENTS = 900

export function d1JsonValue(value: unknown): string {
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new RangeError('D1 JSON bind value is not serializable')
  const bytes = new TextEncoder().encode(encoded).byteLength
  if (bytes > MAX_D1_JSON_BIND_BYTES) {
    throw new RangeError(`D1 JSON bind exceeds ${MAX_D1_JSON_BIND_BYTES} bytes`)
  }
  return encoded
}

export function d1JsonArray(values: readonly (string | number | boolean | null)[]): string {
  return d1JsonValue(values)
}

export function d1JsonStringSet(values: readonly string[]): string {
  return d1JsonArray([...new Set(values.filter(Boolean))])
}
