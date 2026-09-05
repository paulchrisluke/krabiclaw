import { definePlugin } from 'nitro'
import type { PlatformProxy } from 'wrangler'

let platformProxy: Promise<PlatformProxy> | undefined

async function createPlatformProxy() {
  const packageName = 'wrangler'
  const { getPlatformProxy } = await import(/* @vite-ignore */ packageName) as typeof import('wrangler')
  return await getPlatformProxy({
    configPath: 'wrangler.toml',
    persist: true,
    remoteBindings: false,
  })
}

export default definePlugin((nitroApp) => {
  if (!import.meta.dev) return

  platformProxy ??= createPlatformProxy()

  nitroApp.hooks.hook('request', async (event) => {
    const proxy = await platformProxy!
    const request = event.req

    request.runtime ??= { name: 'cloudflare' }
    request.runtime.cloudflare = {
      ...request.runtime.cloudflare,
      env: proxy.env,
      context: proxy.ctx as NonNullable<typeof request.runtime.cloudflare>['context'],
    }
    request.waitUntil = proxy.ctx.waitUntil.bind(proxy.ctx)
    ;(request as unknown as { cf: PlatformProxy['cf'] }).cf = proxy.cf
  })

  nitroApp.hooks.hook('close', async () => {
    if (platformProxy) await (await platformProxy).dispose()
    platformProxy = undefined
  })
})
