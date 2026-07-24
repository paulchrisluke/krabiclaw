import { getAgentSkillVersion } from '~/server/utils/agent-skills/scoped'
import { agentSkillErrorResponse, requireAgentSkillVersionAccess } from '~/server/utils/agent-skills/http'

export default defineEventHandler(async (event) => {
  try {
    const versionId = getRouterParam(event, 'versionId')
    if (!versionId) throw createError({ statusCode: 400, statusMessage: 'versionId is required' })
    const { db } = await requireAgentSkillVersionAccess(event, versionId, 'read')
    const version = await getAgentSkillVersion(db, versionId)
    setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
    setHeader(event, 'content-disposition', `attachment; filename="${version.slug}-v${version.version}.md"`)
    return version.instructions_markdown
  } catch (error) {
    return agentSkillErrorResponse(error)
  }
})
