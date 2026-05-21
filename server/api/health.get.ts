// GET /api/health - Platform system and database health check
import { cloudflareEnv, jsonResponse } from '../utils/api-response'

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
    await db.prepare('SELECT 1').run()
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
