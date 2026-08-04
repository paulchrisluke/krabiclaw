import { jsonResponse } from '~/server/utils/api-response'
import { importAgentSkillMarkdown, parseAgentSkillScope, parseAgentSkillTask } from '~/server/utils/agent-skills/scoped'
import { agentSkillErrorResponse, requireOrganizationAgentSkillAccess, requirePlatformAgentSkillAccess, requireSiteAgentSkillAccess } from '~/server/utils/agent-skills/http'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event) as Record<string, unknown>
    const scopeType = parseAgentSkillScope(body.scope_type)
    const task = parseAgentSkillTask(body.task)
    const siteId = typeof body.site_id === 'string' ? body.site_id : null
    const organizationId = typeof body.organization_id === 'string' ? body.organization_id : null
    let access: Awaited<ReturnType<typeof requirePlatformAgentSkillAccess>>
    if (scopeType === 'platform') {
      access = await requirePlatformAgentSkillAccess(event)
    } else if (scopeType === 'organization') {
      if (!organizationId) throw createError({ statusCode: 400, statusMessage: 'organization_id is required' })
      access = await requireOrganizationAgentSkillAccess(event, organizationId, 'write')
    } else {
      if (!siteId) throw createError({ statusCode: 400, statusMessage: 'site_id is required' })
      access = await requireSiteAgentSkillAccess(event, siteId, 'write')
    }
    const result = await importAgentSkillMarkdown(access.db, {
      scope_type: scopeType,
      organization_id: organizationId,
      site_id: siteId,
      task,
      slug: String(body.slug ?? ''),
      markdown: String(body.markdown ?? ''),
      name: typeof body.name === 'string' ? body.name : null,
      description: typeof body.description === 'string' ? body.description : null,
      priority: body.priority === undefined ? undefined : Number(body.priority),
      activate: body.activate === true,
      created_by_user_id: access.session.user.id,
    })
    return jsonResponse(result, { status: 201 })
  } catch (error) {
    return agentSkillErrorResponse(error)
  }
})
