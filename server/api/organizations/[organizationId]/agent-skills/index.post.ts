import { jsonResponse } from '~/server/utils/api-response'
import { createAgentSkillWithDraft, parseAgentSkillTask } from '~/server/utils/agent-skills/scoped'
import { agentSkillErrorResponse, requireOrganizationAgentSkillAccess } from '~/server/utils/agent-skills/http'

export default defineEventHandler(async (event) => {
  try {
    const organizationId = getRouterParam(event, 'organizationId')
    if (!organizationId) throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
    const { db, session } = await requireOrganizationAgentSkillAccess(event, organizationId, 'write')
    const body = await readBody(event) as Record<string, unknown>
    const result = await createAgentSkillWithDraft(db, {
      scope_type: 'organization',
      organization_id: organizationId,
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
