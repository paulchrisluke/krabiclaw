import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { getAuthSession } from '~/server/utils/auth'
import { resetOrganizationQuota, type UsageResource } from '~/server/utils/usage-metering'

const ALLOWED_RESOURCES = new Set<UsageResource>([
  'ai_inference',
  'mcp_operation',
  'scheduled_task',
  'maps_api',
  'messaging',
  'image_generation',
])

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['billing'] })
  if (permissionDenied) return permissionDenied

  const body = await readBody<{
    organizationId?: string
    resetId?: string
    reason?: string
    grants?: Array<{
      resource?: string
      quantity?: number
      unit?: string
      periodStart?: string
      periodEnd?: string | null
    }>
  }>(event)

  const organizationId = body?.organizationId?.trim()
  const resetId = body?.resetId?.trim()
  const reason = body?.reason?.trim()
  if (!organizationId || !resetId || !reason || !Array.isArray(body.grants) || body.grants.length === 0) {
    return jsonResponse({ error: 'organizationId, resetId, reason, and at least one grant are required' }, { status: 400 })
  }

  const grants = body.grants.map((grant) => {
    if (!grant.resource || !ALLOWED_RESOURCES.has(grant.resource as UsageResource)) {
      throw createError({ statusCode: 400, statusMessage: `Unsupported usage resource: ${grant.resource ?? 'missing'}` })
    }
    if (!Number.isSafeInteger(grant.quantity) || Number(grant.quantity) < 0 || !grant.unit || !grant.periodStart) {
      throw createError({ statusCode: 400, statusMessage: 'Each grant requires a non-negative integer quantity, unit, and periodStart' })
    }
    return {
      resource: grant.resource as UsageResource,
      quantity: Number(grant.quantity),
      unit: grant.unit,
      periodStart: grant.periodStart,
      periodEnd: grant.periodEnd ?? null,
    }
  })
  const resources = new Set<string>()
  for (const grant of grants) {
    if (resources.has(grant.resource)) {
      throw createError({ statusCode: 400, statusMessage: `Duplicate quota resource: ${grant.resource}` })
    }
    resources.add(grant.resource)
  }

  const session = await getAuthSession(event, env)
  await resetOrganizationQuota(db, {
    organizationId,
    resetId,
    reason,
    createdBy: session?.user?.id ?? null,
    grants,
  })

  return jsonResponse({ organizationId, resetId, grants: grants.length, status: 'applied' })
})
