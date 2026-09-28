import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import {
  buildDocsIndexJson, buildPlatformDocLinkEntries, listPublishedDocsForLlm, resolvePublicOrigin, } from '~/server/utils/platform-llm'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const origin = resolvePublicOrigin(event)
  const organizationId = event.context.organizationId as string | undefined
  if (!organizationId) return jsonResponse({ error: 'Unknown site' }, { status: 404 })
  const docs = await listPublishedDocsForLlm(db, organizationId)
  return jsonResponse(buildDocsIndexJson(buildPlatformDocLinkEntries(docs ?? [], origin)))
})
import { defineHandler } from 'nitro';
