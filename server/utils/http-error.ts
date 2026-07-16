export function httpErrorDetails(error: unknown, fallbackMessage: string) {
  if (!error || typeof error !== 'object') {
    return { message: fallbackMessage, statusCode: 500 }
  }

  const candidate = error as { message?: unknown, statusCode?: unknown }
  const parsedCode = typeof candidate.statusCode === 'number' ? candidate.statusCode : 500
  const statusCode = (parsedCode >= 400 && parsedCode < 600) ? parsedCode : 500
  const isServerError = statusCode >= 500
  
  return {
    message: !isServerError && typeof candidate.message === 'string' ? candidate.message : fallbackMessage,
    statusCode,
  }
}
