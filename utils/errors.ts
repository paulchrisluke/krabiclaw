export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const data = (error as Record<string, unknown>).data
    if (data && typeof data === 'object') {
      const dataError = (data as Record<string, unknown>).error
      if (typeof dataError === 'string' && dataError) return dataError
    }
    const errorMessage = (error as Record<string, unknown>).message
    if (typeof errorMessage === 'string' && errorMessage) return errorMessage
  }
  return fallback
}
