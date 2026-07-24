import { jsonResponse } from '~/server/utils/api-response'
import { listAgentSkills, parseAgentSkillTask } from '~/server/utils/agent-skills/scoped'
import { agentSkillErrorResponse, requireSiteAgentSkillAccess } from '~/server/utils/agent-skills/http'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'siteId')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'siteId is required' })
    const { db } = await requireSiteAgentSkillAccess(event, siteId, 'read')
    const query = getQuery(event)
    const task = query.task ? parseAgentSkillTask(query.task) : null
    const skills = await listAgentSkills(db, { scope_type: 'site', site_id: siteId, task })
    return jsonResponse({ skills })
  } catch (error) {
    return agentSkillErrorResponse(error)
  }
})
