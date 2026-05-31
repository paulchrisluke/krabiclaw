// TEMPORARY — remove after debugging KV access in plugin/middleware
export default defineEventHandler(async (event) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfEnv = event.context.cloudflare?.env as any
  const kv = cfEnv?.SITE_CACHE as KVNamespace | undefined

  const envKeys = cfEnv ? Object.keys(cfEnv) : []

  if (!kv) return { error: 'SITE_CACHE KV binding not found', envKeys }

  try {
    await kv.put('debug-test', JSON.stringify({ ts: Date.now() }), { expirationTtl: 120 })
    const val = await kv.get('debug-test')
    return { success: true, wrote: true, read: val, envKeys }
  } catch (err) {
    return { error: String(err), envKeys }
  }
})
