/**
 * The transfer query is an authorization scope, not an optional display
 * preference.  An omitted key is the only form that is allowed to use the
 * legacy "latest accepted transfer" resolver.
 */
export type TransferOnboardingQueryScope =
  | { kind: 'legacy'; transferId?: undefined }
  | { kind: 'exact'; transferId: string }
  | { kind: 'invalid'; message: string }

const INVALID_TRANSFER_QUERY_MESSAGE = 'The transfer query parameter is invalid.'

/**
 * Parse the raw query object without collapsing malformed values into the
 * legacy scope.  Query parsers expose duplicate keys as arrays; accepting the
 * first array element would make the requested transfer ambiguous, so arrays
 * are rejected even when they contain one string. IDs must already be in
 * canonical form; trimming a padded value would collapse two raw query
 * values into one scope.
 */
export function parseTransferOnboardingQuery(query: unknown): TransferOnboardingQueryScope {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    return { kind: 'invalid', message: INVALID_TRANSFER_QUERY_MESSAGE }
  }

  const queryRecord = query as Record<string, unknown>
  if (!Object.prototype.hasOwnProperty.call(queryRecord, 'transfer')) {
    return { kind: 'legacy' }
  }

  const rawTransferId = queryRecord.transfer
  if (typeof rawTransferId !== 'string') {
    return { kind: 'invalid', message: INVALID_TRANSFER_QUERY_MESSAGE }
  }

  const transferId = rawTransferId.trim()
  if (!transferId || transferId !== rawTransferId) {
    return { kind: 'invalid', message: INVALID_TRANSFER_QUERY_MESSAGE }
  }

  return { kind: 'exact', transferId: rawTransferId }
}
