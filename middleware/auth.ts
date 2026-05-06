import { useAuth } from '~/composables/useAuth'

export default defineNuxtRouteMiddleware((to) => {
  console.log('[auth middleware]', {
    to: to.path,
    isAuthenticated: !!useAuth().data.value?.session
  })

  const { data: sessionData } = useAuth()
  
  if (!sessionData.value?.session && to.path !== '/login') {
    return navigateTo('/login')
  }
})
