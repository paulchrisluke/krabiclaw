// GET /api/health - Platform system and database health check
import { cloudflareEnv, jsonResponse } from '../utils/api-response'
import { execute } from '~/server/db'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB

  if (!db) {
    return jsonResponse({
      status: 'error',
      reason: 'Database binding missing'
    }, { status: 500 })
  }

  try {
    // Ping D1 database to verify connection health
    await execute(db, 'SELECT 1')
    return jsonResponse({
      status: 'ok'
    })
  } catch (err) {
    console.error('Health check database query failed:', err)
    return jsonResponse({
      status: 'error',
      reason: err instanceof Error ? err.message : String(err)
    }, { status: 500 })
  }
})
