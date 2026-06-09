import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { processSiteTransferReminders } from '~/server/utils/site-transfer'
import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const result = await processSiteTransferReminders(env, db, { force: true })
  return jsonResponse(result)
})
