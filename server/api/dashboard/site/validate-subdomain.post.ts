// Subdomain validation API endpoint
import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { defineEventHandler, readBody } from 'h3'
import { queryFirst } from '~/server/db'

const reservedSubdomains = [
  'www', 'app', 'api', 'admin', 'dashboard', 'login', 'signup', 
  'pricing', 'billing', 'support', 'help', 'docs', 'blog', 'posts', 
  'qa', 'legal', 'terms', 'privacy', 'static', 'assets', 'cdn', 
  'mail', 'status'
]

function validateSubdomainFormat(subdomain: string): { valid: boolean; reason?: string } {
  if (!subdomain) {
    return { valid: false, reason: 'Subdomain is required' }
  }
  
  if (subdomain.length < 3) {
    return { valid: false, reason: 'Subdomain must be at least 3 characters' }
  }
  
  if (subdomain.length > 63) {
    return { valid: false, reason: 'Subdomain must be 63 characters or less' }
  }
  
  if (reservedSubdomains.includes(subdomain.toLowerCase())) {
    return { valid: false, reason: 'This subdomain is reserved' }
  }
  
  if (!/^[a-z0-9-]+$/.test(subdomain.toLowerCase())) {
    return { valid: false, reason: 'Only letters, numbers, and hyphens are allowed' }
  }
  
  if (subdomain.startsWith('-') || subdomain.endsWith('-')) {
    return { valid: false, reason: 'Subdomain cannot start or end with a hyphen' }
  }
  
  return { valid: true }
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) {
    return jsonResponse({ 
      available: false, 
      message: 'Database not available' 
    }, { status: 500 })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  const body = await readBody(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({
      available: false,
      message: 'Subdomain is required'
    }, { status: 400 })
  }
  const { subdomain } = body

  if (!subdomain || typeof subdomain !== 'string') {
    return jsonResponse({ 
      available: false, 
      message: 'Subdomain is required' 
    }, { status: 400 })
  }

  // Validate format
  const formatValidation = validateSubdomainFormat(subdomain)
  if (!formatValidation.valid) {
    return jsonResponse({ 
      available: false, 
      message: formatValidation.reason 
    }, { status: 400 })
  }

  try {
    // Check if subdomain already exists
    const existing = await queryFirst(db, `
      SELECT id FROM sites
      WHERE subdomain = ?
      LIMIT 1
    `, [subdomain.toLowerCase()])
    
    if (existing) {
      return jsonResponse({ 
        available: false, 
        message: 'This subdomain is already taken' 
      })
    }
    
    return jsonResponse({ 
      available: true, 
      message: 'Available!' 
    })
    
  } catch (error) {
    console.error('Subdomain validation error:', error)
    return jsonResponse({ 
      available: false, 
      message: 'Error checking subdomain availability' 
    }, { status: 500 })
  }
})
