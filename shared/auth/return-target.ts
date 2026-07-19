export interface AppReturnTarget {
  redirect?: string
}

export function validatedInternalPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return undefined
  try {
    const resolved = new URL(value, 'https://krabiclaw.internal')
    return resolved.origin === 'https://krabiclaw.internal'
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : undefined
  } catch {
    return undefined
  }
}

export function buildPostLoginUrl(target: AppReturnTarget = {}): string {
  const redirect = validatedInternalPath(target.redirect)
  return redirect ? `/api/post-login?redirect=${encodeURIComponent(redirect)}` : '/api/post-login'
}

export function buildLoginUrl(target: AppReturnTarget = {}): string {
  const redirect = validatedInternalPath(target.redirect)
  return redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'
}
