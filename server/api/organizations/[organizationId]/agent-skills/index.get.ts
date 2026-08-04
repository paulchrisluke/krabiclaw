import { jsonResponse } from '~/server/utils/api-response'
import { listAgentSkills, parseAgentSkillTask } from '~/server/utils/agent-skills/scoped'
import { agentSkillErrorResponse, requireOrganizationAgentSkillAccess } from '~/server/utils/agent-skills/http'

export default defineEventHandler(async (event) => {
  try {
    const organizationId = getRouterParam(event, 'organizationId')
    if (!organizationId) throw createError({ statusCode: 400, statusMessage: 'organizationId is required' })
    const { db } = await requireOrganizationAgentSkillAccess(event, organizationId, 'read')
    const query = getQuery(event)
    const task = query.task ? parseAgentSkillTask(query.task) : null
    const skills = await listAgentSkills(db, { scope_type: 'organization', organization_id: organizationId, site_id: null, task })
    return jsonResponse({ skills })
  } catch (error) {
    return agentSkillErrorResponse(error)
  }
})
