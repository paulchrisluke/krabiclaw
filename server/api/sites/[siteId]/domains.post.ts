// Add a domain to a site
import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { 
  normalizeDomain, 
  validateCustomDomain, 
  isDomainAvailable, 
  hasCustomDomainsEntitlement,
  createCustomDomain
} from '../../../utils/domains'

interface AddDomainRequest {
  domain: string
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody(event) as AddDomainRequest
  const { domain } = body
  
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
    }, { status: 400 })
  }
  
  if (!domain) {
    return jsonResponse({ 
      error: 'Domain is required' 
    }, { status: 400 })
  }
  
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  // Get authenticated user
  const headers = getHeaders(event)
  const session = await $fetch('/api/auth/get-session', {
    headers: {
      cookie: headers.cookie || '',
      authorization: headers.authorization || ''
    }
  })
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }

  try {
    // Verify user has access to the site
    const site = await db.prepare(`
      SELECT s.id, s.organization_id FROM sites s
      JOIN organizations o ON s.organization_id = o.id
      JOIN organization_members om ON o.id = om.organization_id
      WHERE s.id = ? AND om.user_id = ? AND om.role = 'owner'
      LIMIT 1
    `).bind(siteId, session.user.id).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    // Check custom domains entitlement
    const hasEntitlement = await hasCustomDomainsEntitlement(env, db, site.organization_id)
    if (!hasEntitlement) {
      return jsonResponse({ 
        error: 'Custom domains require a paid plan. Upgrade your plan to add custom domains.' 
      }, { status: 403 })
    }

    // Validate domain format
    const validation = validateCustomDomain(domain)
    if (!validation.valid) {
      return jsonResponse({ 
        error: validation.reason 
      }, { status: 400 })
    }

    const normalizedDomain = normalizeDomain(domain)

    // Check if domain is available
    const isAvailable = await isDomainAvailable(db, normalizedDomain, siteId)
    if (!isAvailable) {
      return jsonResponse({ 
        error: 'This domain is already in use by another site' 
      }, { status: 409 })
    }

    // Create custom domain record
    const domainRecord = await createCustomDomain(db, siteId, site.organization_id, normalizedDomain)
    
    return jsonResponse({
      success: true,
      domain: domainRecord,
      message: 'Domain added successfully. Please complete DNS verification to activate it.'
    })
    
  } catch (error) {
    console.error('Failed to add domain:', error)
    return jsonResponse({ 
      error: 'Failed to add domain' 
    }, { status: 500 })
  }
})
