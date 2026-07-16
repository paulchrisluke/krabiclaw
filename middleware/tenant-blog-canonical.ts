import { tenantBlogPostPath } from '~/utils/tenant-blog-route'

export default defineNuxtRouteMiddleware((to) => {
  const { isBlawby } = usePublicTemplate()
  if (!isBlawby.value) return
  return navigateTo({ path: tenantBlogPostPath({ theme: 'blawby' }, String(to.params.slug || '')), query: to.query, hash: to.hash }, { redirectCode: 301 })
})
