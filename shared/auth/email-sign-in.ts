export function requiresEmailVerification(error: ({ code?: unknown } & Record<string, unknown>) | null | undefined): boolean {
  return error?.code === 'EMAIL_NOT_VERIFIED'
}
