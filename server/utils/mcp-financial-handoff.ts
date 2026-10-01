/** Preserve the canonical actor-bound financial approval handoff without exposing arbitrary error data. */
export function mcpFinancialApprovalErrorResult(error: unknown, platformOrigin: string | undefined, message: string) {
  if (!error || typeof error !== 'object' || !('statusCode' in error) || error.statusCode !== 409
    || !('data' in error) || !error.data || typeof error.data !== 'object'
    || !('financial_approval_url' in error.data)) return null
  const path = error.data.financial_approval_url
  if (typeof path !== 'string' || !/^\/dashboard\/[^/]+\/payments\/refunds\/approve\?id=[a-f0-9-]{36}$/iu.test(path)) return null
  let url: URL
  try { url = new URL(path, platformOrigin) } catch { return null }
  if (!['https:', 'http:'].includes(url.protocol)) return null
  const structuredContent = {
    success: false, operation_completed: false, confirmation_required: true,
    code: 'financial_approval_required', financial_approval_url: url.toString(),
  }
  return { isError: true, structuredContent, content: [{ type: 'text' as const, text: `${message}\nApprove the financial instruction in the authenticated browser: ${url}` }] }
}
