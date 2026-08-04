import { jsonResponse } from '~/server/utils/api-response'
import { listAgentSkills, parseAgentSkillTask } from '~/server/utils/agent-skills/scoped'
import { agentSkillErrorResponse, requirePlatformAgentSkillAccess } from '~/server/utils/agent-skills/http'

export default defineEventHandler(async (event) => {
  try {
    const { db } = await requirePlatformAgentSkillAccess(event)
    const query = getQuery(event)
    const task = query.task ? parseAgentSkillTask(query.task) : null
    const skills = await listAgentSkills(db, { scope_type: 'platform', organization_id: null, site_id: null, task })
    return jsonResponse({ skills })
  } catch (error) {
    return agentSkillErrorResponse(error)
  }
})
