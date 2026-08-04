export default defineNuxtPlugin((nuxtApp) => {
  type VueErrorHandler = (_error: unknown, _instance: unknown, _info: string | undefined) => void
  const pendingVueErrors: Array<Parameters<VueErrorHandler>> = []
  let handleVueError: VueErrorHandler | null = null

  nuxtApp.hook('vue:error', (error, instance, info) => {
    if (handleVueError) {
      handleVueError(error, instance, info)
    } else {
      pendingVueErrors.push([error, instance, info])
    }
  })

  nuxtApp.hook('app:mounted', async () => {
    const { registerErrorTracking } = await import('~/utils/error-tracking-runtime.client')
    handleVueError = await nuxtApp.runWithContext(() => registerErrorTracking())
    for (const [error, instance, info] of pendingVueErrors) {
      handleVueError(error, instance, info)
    }
    pendingVueErrors.length = 0
  })
})
