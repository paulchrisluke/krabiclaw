export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  
  // Required public environment variables
  const requiredPublicVars = [
    { key: 'public.platformDomain', env: 'NUXT_PUBLIC_PLATFORM_DOMAIN' },
    { key: 'public.freeSiteDomain', env: 'NUXT_PUBLIC_FREE_SITE_DOMAIN' },
    { key: 'public.appName', env: 'NUXT_PUBLIC_APP_NAME' }
  ]

  const requiredTurnstileVars = [
    { key: 'public.turnstileSiteKey', env: 'NUXT_PUBLIC_TURNSTILE_SITE_KEY' },
    { key: 'turnstileSecretKey', env: 'TURNSTILE_SECRET_KEY' }
  ]
  
  const missingVars: string[] = []
  
  // Check public variables
  for (const { key, env } of requiredPublicVars) {
    const value = getNestedValue(config, key)
    if (!value || value.trim() === '') {
      missingVars.push(env)
    }
  }
  
  const turnstileEnabled = config.public.turnstileEnabled === true

  if (turnstileEnabled) {
    for (const { key, env } of requiredTurnstileVars) {
      const value = getNestedValue(config, key)
      if (!value || value.trim() === '') {
        missingVars.push(env)
      }
    }
  }
  
  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables:\n` +
      missingVars.map(env => `  - ${env}`).join('\n') +
      `\n\nPlease set these environment variables and restart the server.\n` +
      `See .env.example for required values.`
    )
  }
})

// Helper function to get nested object values by string path
function getNestedValue(obj: any, path: string): string {
  return path.split('.').reduce((current, key) => current?.[key], obj) || ''
}
