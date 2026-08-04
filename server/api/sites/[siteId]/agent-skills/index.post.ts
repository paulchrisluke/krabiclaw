import { jsonResponse } from '~/server/utils/api-response'
import { createAgentSkillWithDraft, parseAgentSkillTask } from '~/server/utils/agent-skills/scoped'
import { agentSkillErrorResponse, requireSiteAgentSkillAccess } from '~/server/utils/agent-skills/http'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'siteId')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'siteId is required' })
    const { db, session, site } = await requireSiteAgentSkillAccess(event, siteId, 'write')
    const body = await readBody(event) as Record<string, unknown>
    const result = await createAgentSkillWithDraft(db, {
      scope_type: 'site',
      organization_id: site.organization_id,
      site_id: siteId,
      task: parseAgentSkillTask(body.task),
      slug: String(body.slug ?? ''),
      name: String(body.name ?? ''),
      description: String(body.description ?? ''),
      instructions_markdown: String(body.instructions_markdown ?? ''),
      priority: body.priority === undefined ? undefined : Number(body.priority),
      created_by_user_id: session.user.id,
    })
    return jsonResponse(result, { status: 201 })
  } catch (error) {
    return agentSkillErrorResponse(error)
  }
})
