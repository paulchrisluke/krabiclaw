// SEO 301 redirects for legacy legal URLs
import { defineEventHandler, getRequestURL, sendRedirect } from 'h3'

const redirects: Record<string, string> = {
  '/privacy-policy': '/privacy',
  '/terms-and-conditions': '/terms',
}

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const target = redirects[url.pathname]
  if (target) {
    const targetWithParams = `${target}${url.search}${url.hash}`
    // Permanent redirect for SEO
    return sendRedirect(event, targetWithParams, 301)
  }
})
