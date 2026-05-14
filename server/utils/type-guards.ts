export type UnknownRecord = Record<string, unknown>

export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const readString = (value: unknown, key: string): string | undefined => {
  if (!isRecord(value)) return undefined
  const field = value[key]
  return typeof field === 'string' ? field : undefined
}

export const readNumber = (value: unknown, key: string): number | undefined => {
  if (!isRecord(value)) return undefined
  const field = value[key]
  return typeof field === 'number' ? field : undefined
}

export const readRecord = (value: unknown, key: string): UnknownRecord | undefined => {
  if (!isRecord(value)) return undefined
  const field = value[key]
  return isRecord(field) ? field : undefined
}

export const readArray = (value: unknown, key: string): ApiRecord[] => {
  if (!isRecord(value)) return []
  const field = value[key]
  return Array.isArray(field) ? field : []
}

export const errorMessage = (error: unknown, fallback = 'Unknown error'): string => {
  if (error instanceof Error && error.message) return error.message
  if (isRecord(error)) {
    const data = readRecord(error, 'data')
    return readString(data, 'message')
      ?? readString(data, 'error')
      ?? readString(error, 'message')
      ?? readString(error, 'error')
      ?? fallback
  }
  return fallback
}

