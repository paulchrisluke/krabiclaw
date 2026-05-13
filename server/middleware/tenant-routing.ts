// Tenant routing middleware based on onboarding status
// Routes tenant requests to appropriate pages

import { defineEventHandler, getRequestURL, sendRedirect } from 'h3'

export default defineEventHandler(async (event) => {
  const tenantType = event.context.tenantType
  const onboardingStatus = event.context.onboardingStatus
  const url = getRequestURL(event)
  const pathname = url.pathname

  // Only process tenant requests
  if (!tenantType?.startsWith('tenant')) {
    return
  }

  // Handle unknown tenant (404)
  if (tenantType === 'tenant-404') {
    event.node.res.statusCode = 404
    if (pathname === '/tenant-404') {
      return
    }
    return sendRedirect(event, '/tenant-404')
  }

  // Handle tenant sites based on onboarding status
  if (tenantType === 'tenant') {
    switch (onboardingStatus) {
      case 'pending':
        return sendRedirect(event, '/tenant-setup-pending')
      
      case 'failed':
        return sendRedirect(event, '/tenant-setup-incomplete')
      
      case 'active':
        if (
          event.context.canonicalDomain &&
          event.context.tenantHost &&
          event.context.tenantHost !== event.context.canonicalDomain &&
          !pathname.startsWith('/api/')
        ) {
          // Derive protocol from x-forwarded-proto, connection, or default to https
          let protocol = 'https'
          const xfProto = event.node.req.headers['x-forwarded-proto']
          if (typeof xfProto === 'string') protocol = xfProto.split(',')[0].trim()
          else if (event.node.req.connection?.encrypted) protocol = 'https'
          else if (event.node.req.connection) protocol = 'http'
          // Optionally allow override via env/config
          if (process.env.DEFAULT_PROTOCOL) protocol = process.env.DEFAULT_PROTOCOL
          return sendRedirect(event, `${protocol}://${event.context.canonicalDomain}${url.pathname}${url.search}`, 301)
        }
        // Let the request continue to render the Saya site
        return
      
      default:
        // Unknown status, treat as 404
        event.node.res.statusCode = 404
        return sendRedirect(event, '/tenant-404')
    }
  }
})
