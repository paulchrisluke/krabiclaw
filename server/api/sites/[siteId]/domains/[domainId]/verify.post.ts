// Verify DNS record for a domain
import { cloudflareEnv, jsonResponse } from '../../../../../utils/api-response'
import { verifyDnsRecord, getVerificationRecordName } from '../../../../../utils/domains'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const domainId = getRouterParam(event, 'domainId')
  
  if (!siteId || !domainId) {
    return jsonResponse({ 
      error: 'Site ID and domain ID are required' 
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
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role = 'owner'
      LIMIT 1
    `).bind(siteId, session.user.id).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    // Get domain record
    const domain = await db.prepare(`
      SELECT * FROM site_domains 
      WHERE id = ? AND site_id = ? AND type = 'custom'
      LIMIT 1
    `).bind(domainId, siteId).first()
    
    if (!domain) {
      return jsonResponse({ 
        error: 'Domain not found' 
      }, { status: 404 })
    }

    // Mark as verifying
    await db.prepare(`
      UPDATE site_domains 
      SET status = 'verifying', last_checked_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      new Date().toISOString(),
      new Date().toISOString(),
      domainId
    ).run()

    // Perform DNS verification
    const result = await verifyDnsRecord(db, domainId)
    
    if (result.success) {
      return jsonResponse({
        success: true,
        message: result.message,
        domain: {
          ...domain,
          status: 'active',
          verified_at: new Date().toISOString()
        }
      })
    } else {
      return jsonResponse({
        success: false,
        message: result.message,
        verificationInstructions: {
          recordType: 'TXT',
          recordName: getVerificationRecordName(domain.domain || ''),
          recordValue: domain.verification_token
        }
      }, { status: 400 })
    }
    
  } catch (error) {
    console.error('Failed to verify domain:', error)
    return jsonResponse({ 
      error: 'Failed to verify domain' 
    }, { status: 500 })
  }
})
