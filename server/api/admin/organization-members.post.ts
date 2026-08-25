import { defineHandler } from 'nitro'
import { readBody } from 'nitro/h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'
import { adminHeadersForEvent, authAdminApi, findPlatformUserByEmail, platformPermissionError, requirePlatformEventPermission } from '~/server/utils/platform-admin-users'

const roles = new Set(['owner', 'admin', 'member', 'editor'])

interface OrganizationMemberApi {
  addMember(_input: {
    body: { userId: string; role: string; organizationId: string }
  }): Promise<{ id: string; userId: string; organizationId: string; role: string }>
}

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const body = await readBody(event).catch(() => ({})) as { organizationId?: string; email?: string; role?: string }
  const organizationId = body.organizationId?.trim()
  const email = body.email?.trim().toLowerCase()
  const role = body.role?.trim()

  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })
  if (!email) return jsonResponse({ error: 'Email is required' }, { status: 400 })
  if (!role || !roles.has(role)) return jsonResponse({ error: 'Valid role is required' }, { status: 400 })

  try {
    await requirePlatformEventPermission(event, env, { platform: ['organizations'] })
    const headers = adminHeadersForEvent(event)
    const user = await findPlatformUserByEmail(authAdminApi(env), headers, email)
    if (!user) return jsonResponse({ error: 'User not found' }, { status: 404 })

    const member = await (createAuth(env).api as unknown as OrganizationMemberApi).addMember({
      body: { userId: user.id, role, organizationId },
    })

    return jsonResponse({ success: true, member, email: user.email })
  } catch (error) {
    const { statusCode, message } = platformPermissionError(error, 'Failed to add organization member')
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
