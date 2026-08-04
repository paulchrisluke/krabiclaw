import { jsonResponse } from '~/server/utils/api-response'
import { archiveActiveVersion } from '~/server/utils/agent-skills/scoped'
import { agentSkillErrorResponse, requireAgentSkillVersionAccess } from '~/server/utils/agent-skills/http'

export default defineEventHandler(async (event) => {
  try {
    const versionId = getRouterParam(event, 'versionId')
    if (!versionId) throw createError({ statusCode: 400, statusMessage: 'versionId is required' })
    const { db } = await requireAgentSkillVersionAccess(event, versionId, 'write')
    return jsonResponse(await archiveActiveVersion(db, versionId))
  } catch (error) {
    return agentSkillErrorResponse(error)
  }
})
