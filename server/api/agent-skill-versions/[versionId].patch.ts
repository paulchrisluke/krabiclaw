import { jsonResponse } from '~/server/utils/api-response'
import { updateDraftVersion } from '~/server/utils/agent-skills/scoped'
import { agentSkillErrorResponse, requireAgentSkillVersionAccess } from '~/server/utils/agent-skills/http'

export default defineEventHandler(async (event) => {
  try {
    const versionId = getRouterParam(event, 'versionId')
    if (!versionId) throw createError({ statusCode: 400, statusMessage: 'versionId is required' })
    const { db } = await requireAgentSkillVersionAccess(event, versionId, 'write')
    const body = await readBody(event) as Record<string, unknown>
    return jsonResponse(await updateDraftVersion(db, versionId, body))
  } catch (error) {
    return agentSkillErrorResponse(error)
  }
})
