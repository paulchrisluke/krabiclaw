import { jsonResponse } from '~/server/utils/api-response'
import { createNextDraftVersion } from '~/server/utils/agent-skills/scoped'
import { agentSkillErrorResponse, requireAgentSkillIdentityAccess } from '~/server/utils/agent-skills/http'

export default defineEventHandler(async (event) => {
  try {
    const skillId = getRouterParam(event, 'skillId')
    if (!skillId) throw createError({ statusCode: 400, statusMessage: 'skillId is required' })
    const { db, session } = await requireAgentSkillIdentityAccess(event, skillId, 'write')
    return jsonResponse(await createNextDraftVersion(db, skillId, session.user.id), { status: 201 })
  } catch (error) {
    return agentSkillErrorResponse(error)
  }
})
