import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import {
  buildDocsIndexJson,
  buildPlatformDocLinkEntries,
  listPublishedPlatformDocsForLlm,
  resolvePublicOrigin,
} from '~/server/utils/platform-llm'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const origin = resolvePublicOrigin(event)
  const docs = await listPublishedPlatformDocsForLlm(db)
  return jsonResponse(buildDocsIndexJson(buildPlatformDocLinkEntries(docs ?? [], origin)))
})
