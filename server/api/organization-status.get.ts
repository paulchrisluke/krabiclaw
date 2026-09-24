// Organization status check for tenant setup pages
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
    // Verify the organization is active
    const organization = await queryFirst<{ onboarding_status: string; status: string }>(db, `
      SELECT onboarding_status, status FROM organization
      WHERE id = ? AND status = 'active' AND onboarding_status = 'active'
      LIMIT 1
    `, [organizationId])

    if (!organization) {
      return jsonResponse({ 
        error: 'Organization not ready' 
      }, { status: 404 })
    }

    return jsonResponse({
      status: 'ready', onboarding_status: organization.onboarding_status
    })

  } catch (error) {
    console.error('Organization status check failed:', error)
    return jsonResponse({ 
      error: 'Failed to check site status' 
    }, { status: 500 })
  }
})
import { defineHandler } from 'nitro';
