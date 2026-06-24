// Site status check for tenant setup pages
import { cloudflareEnv, jsonResponse } from '../utils/api-response'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  // Get site context from middleware
  const siteId = event.context.siteId

  if (!siteId) {
    return jsonResponse({ 
      error: 'No site context' 
    }, { status: 404 })
  }

  try {
    // Verify site is active
    const site = await queryFirst<{ onboarding_status: string; status: string }>(db, `
      SELECT onboarding_status, status FROM sites
      WHERE id = ? AND status = 'active' AND onboarding_status = 'active'
      LIMIT 1
    `, [siteId])

    if (!site) {
      return jsonResponse({ 
        error: 'Site not ready' 
      }, { status: 404 })
    }

    return jsonResponse({
      status: 'ready',
      onboarding_status: site.onboarding_status
    })

  } catch (error) {
    console.error('Site status check failed:', error)
    return jsonResponse({ 
      error: 'Failed to check site status' 
    }, { status: 500 })
  }
})
