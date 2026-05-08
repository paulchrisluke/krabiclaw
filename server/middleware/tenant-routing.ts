// Tenant routing middleware based on onboarding status
// Routes tenant requests to appropriate pages

import { defineEventHandler, getRequestURL, sendRedirect } from 'h3'

export default defineEventHandler(async (event) => {
  const tenantType = event.context.tenantType
  const onboardingStatus = event.context.onboardingStatus
  const pathname = getRequestURL(event).pathname

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
        // Let the request continue to render the Saya site
        return
      
      default:
        // Unknown status, treat as 404
        event.node.res.statusCode = 404
        return sendRedirect(event, '/tenant-404')
    }
  }
})
