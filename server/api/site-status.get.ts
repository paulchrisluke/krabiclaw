// Site status check for tenant setup pages
import { cloudflareEnv, jsonResponse } from '../utils/api-response'
import { queryFirst } from '~/server/db'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  // Get tenant context from middleware
  const organizationId = event.context.organizationId

  if (!organizationId) {
    return jsonResponse({ 
      error: 'No tenant context' 
    }, { status: 404 })
  }

  try {
    // Verify site is active
    const site = await queryFirst<{ onboarding_status: string; status: string }>(db, `
      SELECT onboarding_status, status FROM organization
      WHERE id = ? AND status = 'active' AND onboarding_status = 'active'
      LIMIT 1
    `, [organizationId])

    if (!site) {
      return jsonResponse({ 
        error: 'Site not ready' 
      }, { status: 404 })
    }

    return jsonResponse({
      status: 'ready', onboarding_status: site.onboarding_status
    })

  } catch (error) {
    console.error('Site status check failed:', error)
    return jsonResponse({ 
      error: 'Failed to check site status' 
    }, { status: 500 })
  }
})
import { defineHandler } from 'nitro';
