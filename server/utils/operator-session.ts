// Better Auth impersonation is the only cross-user client-workspace access mechanism for
// platform support. A global platform admin may touch tenant dashboard/MCP data only when
// either (a) they are an actual member of the target org with sufficient org/team permissions,
// or (b) they are in a Better Auth impersonation session for a user who has that access.
// Platform admin status alone is never tenant owner access — do not add a support-mode cookie,
// acting-as principal, or owner-equivalent bypass; use authClient.admin.impersonateUser() /
// stopImpersonating() and keep the impersonation banner visible until it succeeds.
export type OperatorSessionErrorCode = 'authentication_required' | 'impersonation_forbidden'

export class OperatorSessionError extends Error {
  readonly code: OperatorSessionErrorCode
  readonly statusCode: number

  constructor(code: OperatorSessionErrorCode, statusCode: number, message: string) {
    super(message)
    this.name = 'OperatorSessionError'
    this.code = code
    this.statusCode = statusCode
  }
}

function fail(code: OperatorSessionErrorCode, statusCode: number, message: string): never {
  throw new OperatorSessionError(code, statusCode, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function assertDirectOperatorSession(session: unknown): string {
  if (!isRecord(session)) fail('authentication_required', 401, 'Authentication required.')
  const user = isRecord(session.user) ? session.user : null
  const userId = typeof user?.id === 'string' ? user.id.trim() : ''
  if (!userId) fail('authentication_required', 401, 'Authenticated operator user is required.')
  const authSession = isRecord(session.session) ? session.session : null
  const nestedImpersonatedBy = authSession?.impersonatedBy
  const topLevelImpersonatedBy = session.impersonatedBy
  if (
    (typeof nestedImpersonatedBy === 'string' && nestedImpersonatedBy.trim())
    || (typeof topLevelImpersonatedBy === 'string' && topLevelImpersonatedBy.trim())
  ) {
    fail('impersonation_forbidden', 403, 'Operator sessions cannot run in an impersonation session.')
  }
  return userId
}
