// DNS verification API for checking TXT records
import { jsonResponse } from '../../utils/api-response'
import { defineEventHandler, getQuery } from 'h3'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { domain } = query
  
  if (!domain || typeof domain !== 'string') {
    return jsonResponse({ 
      error: 'Domain parameter is required' 
    }, { status: 400 })
  }
  
  // This is a mock implementation for DNS verification
  // In production, you would use a DNS lookup service like:
  // - Cloudflare API
  // - Google DNS API
  // - Node.js 'dns' module (if available in your runtime)
  
  try {
    // For now, we'll return a mock response indicating manual verification
    // The actual verification happens in the domain verification endpoint
    
    return jsonResponse({
      success: false,
      message: 'Manual DNS verification required',
      instructions: {
        type: 'TXT',
        name: `_krabiclaw.${domain}`,
        value: 'Please use the verification token from your domain settings',
        note: 'DNS records may take time to propagate. Check back in a few minutes after adding the record. Note: We also support the legacy _thaiclawai prefix during transition.',
        legacyName: `_thaiclawai.${domain}`
      }
    })
    
  } catch (error) {
    console.error('DNS verification failed:', error)
    return jsonResponse({ 
      error: 'Failed to check DNS record' 
    }, { status: 500 })
  }
})
