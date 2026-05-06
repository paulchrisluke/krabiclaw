
import { createAuth } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const env = event.context.cloudflare?.env
  if (!env?.REVIEWS_DB) throw createError({ statusCode: 503, message: 'Database unavailable' })

  const auth = createAuth(env)
  
  try {
    const request = toWebRequest(event)
    const response = await auth.handler(request)
    
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
