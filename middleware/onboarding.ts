import { useAuth } from '~/composables/useAuth'

export default defineNuxtRouteMiddleware(async (to) => {
  console.log('[onboarding middleware]', {
    to: to.path,
    checking: true
  })

  const { data: sessionData } = useAuth()
  
  // Fast fail if no session
  if (!sessionData.value?.session) {
    return navigateTo('/login')
  }

  try {
    // Check onboarding status with timeout
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Session check timed out')), 2000)
    )

    const statusRequest = $fetch('/api/onboarding/status', {
      credentials: 'include'
    })

    const status = await Promise.race([statusRequest, timeout])
    
    if (status.needsOnboarding && to.path !== '/dashboard/onboarding') {
      console.log('[onboarding middleware] Redirecting to onboarding')
      return navigateTo('/dashboard/onboarding')
    }

    if (!status.needsOnboarding && status.sites.length > 0) {
      console.log('[onboarding middleware] User has sites, redirecting to dashboard')
      return navigateTo('/dashboard')
    }

    console.log('[onboarding middleware] Allowing access to:', to.path)
  } catch (error) {
    console.error('[onboarding middleware] Error:', error)
    if (error.message?.includes('timed out')) {
      console.log('[onboarding middleware] Session check timed out, redirecting to login')
      return navigateTo('/login')
    }
    // Allow access if check fails
  }
})
