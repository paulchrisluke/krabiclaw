import { getRequestURL, useRuntimeConfig } from '#imports'

const proxyPromise = createPlatformProxy()
  .catch((error) => {
    console.error('Failed to initialize wrangler bindings proxy', error)
    return createStubProxy()
  })
  .then((proxy) => {
    globalThis.__env__ = proxy.env
    return proxy
  })

globalThis.__env__ = proxyPromise.then((proxy) => proxy.env)

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    const proxy = await proxyPromise
    event.context.cf = proxy.cf
    event.context.waitUntil = proxy.ctx.waitUntil.bind(proxy.ctx)

    const request = new Request(getRequestURL(event))
    ;(request as Request & { cf?: unknown }).cf = proxy.cf

    event.context.cloudflare = {
      ...event.context.cloudflare,
      request,
      env: proxy.env,
      context: proxy.ctx,
    }

    event.node.req.__unenv__ = {
      ...event.node.req.__unenv__,
      waitUntil: event.context.waitUntil,
    }
  })

  nitroApp.hooks._hooks.request.unshift(nitroApp.hooks._hooks.request.pop())
  nitroApp.hooks.hook('close', async () => {
    const proxy = await proxyPromise
    await proxy.dispose()
  })
})

async function createPlatformProxy() {
  const wranglerPackage = 'wrangler'
  const { getPlatformProxy } = await import(wranglerPackage).catch(() => {
    throw new Error('Package `wrangler` not found; local Cloudflare dev bindings require it.')
  })
  const runtimeConfig = useRuntimeConfig()
  const proxyOptions: {
    configPath?: string
    persist?: { path: string }
    environment?: string
    remoteBindings?: boolean
  } = {
    configPath: runtimeConfig.wrangler.configPath,
    persist: { path: runtimeConfig.wrangler.persistDir },
    remoteBindings: runtimeConfig.wrangler.remoteBindings,
  }

  if (runtimeConfig.wrangler.environment) {
    proxyOptions.environment = runtimeConfig.wrangler.environment
  }

  return getPlatformProxy(proxyOptions)
}

function createStubProxy() {
  return {
    env: {},
    cf: {},
    ctx: {
      waitUntil() {},
      passThroughOnException() {},
    },
    caches: {
      open() {
        return Promise.resolve(new CacheStub())
      },
      get default() {
        return new CacheStub()
      },
    },
    dispose: () => Promise.resolve(),
  }
}

class CacheStub {
  delete() {
    return Promise.resolve(false)
  }

  match() {
    return Promise.resolve(undefined)
  }

  put() {
    return Promise.resolve()
  }
}
