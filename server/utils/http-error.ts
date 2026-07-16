export function httpErrorDetails(error: unknown, fallbackMessage: string) {
  if (!error || typeof error !== 'object') {
    return { message: fallbackMessage, statusCode: 500 }
  }

  const candidate = error as { message?: unknown, statusCode?: unknown }
  return {
    message: typeof candidate.message === 'string' ? candidate.message : fallbackMessage,
    statusCode: typeof candidate.statusCode === 'number' ? candidate.statusCode : 500,
  }
}
