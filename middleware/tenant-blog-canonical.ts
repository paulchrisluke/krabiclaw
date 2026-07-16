import { tenantBlogPostPath } from '~/utils/tenant-blog-route'

export default defineNuxtRouteMiddleware((to) => {
  const { isBlawby } = usePublicTemplate()
  if (!isBlawby.value) return
  return navigateTo(tenantBlogPostPath({ theme: 'blawby' }, String(to.params.slug || '')), { redirectCode: 301 })
})
