
import { createAuth } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // DEBUG: Log cloudflare context and env to verify D1 binding in dev
  // eslint-disable-next-line no-console
  console.log('[auth handler] event.context.cloudflare:', event.context.cloudflare)
  // eslint-disable-next-line no-console
  console.log('[auth handler] event.context.cloudflare?.env:', event.context.cloudflare?.env)

  const env = event.context.cloudflare?.env
  if (!env?.REVIEWS_DB) throw createError({ statusCode: 503, message: 'Database unavailable' })

  const auth = createAuth(env)
  
  try {
    const request = toWebRequest(event)
    console.log('Auth request:', {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries())
    })
    
    const response = await auth.handler(request)
    
    console.log('Auth response:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    })
    
    // Check for error responses
    if (response.status >= 400) {
      const responseText = await response.text()
      console.error('Auth error response:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText
      })
      return new Response(responseText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    }
    
    return response
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    
    console.error('Auth handler error:', {
      error: errorMessage,
      stack: errorStack,
      url: event.node.req.url,
      method: event.node.req.method
    })
    
    throw createError({
      statusCode: 500,
      statusMessage: `Auth error: ${errorMessage}`
    })
  }
})