import { jsonResponse } from '~/server/utils/api-response'
import { resolveAgentGuidance, parseAgentSkillTask } from '~/server/utils/agent-skills/scoped'
import { agentSkillErrorResponse, requirePlatformAgentSkillAccess, requireSiteAgentSkillAccess } from '~/server/utils/agent-skills/http'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const task = parseAgentSkillTask(query.task)
    const siteId = typeof query.site_id === 'string' ? query.site_id : null
    if (siteId) {
      const { db } = await requireSiteAgentSkillAccess(event, siteId, 'read')
      return jsonResponse(await resolveAgentGuidance(db, { task, audience: 'tenant', siteId }))
    }
    const { db } = await requirePlatformAgentSkillAccess(event)
    return jsonResponse(await resolveAgentGuidance(db, { task, audience: 'platform' }))
  } catch (error) {
    return agentSkillErrorResponse(error)
  }
})
