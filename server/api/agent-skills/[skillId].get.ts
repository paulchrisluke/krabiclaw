import { jsonResponse } from '~/server/utils/api-response'
import { getAgentSkill } from '~/server/utils/agent-skills/scoped'
import { agentSkillErrorResponse, requireAgentSkillIdentityAccess } from '~/server/utils/agent-skills/http'

export default defineEventHandler(async (event) => {
  try {
    const skillId = getRouterParam(event, 'skillId')
    if (!skillId) throw createError({ statusCode: 400, statusMessage: 'skillId is required' })
    const { db } = await requireAgentSkillIdentityAccess(event, skillId, 'read')
    return jsonResponse(await getAgentSkill(db, skillId))
  } catch (error) {
    return agentSkillErrorResponse(error)
  }
})
