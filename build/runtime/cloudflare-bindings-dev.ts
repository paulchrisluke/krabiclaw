import { getRequestURL } from 'h3'
import { useRuntimeConfig } from '#imports'

const proxyPromise = createPlatformProxy()
  .catch((error) => {
    console.error('Failed to initialize wrangler bindings proxy', error)
    return createStubProxy()
  })
  .then((proxy) => {
    globalThis.__env__ = proxy.env
    return proxy
  })

declare global {
  var __env__: Record<string, unknown>
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    const proxy = await proxyPromise
    event.context.cf = proxy.cf
    event.context.waitUntil = proxy.ctx.waitUntil.bind(proxy.ctx)

    const request = (event.context.cloudflare?.request as Request) || new Request(getRequestURL(event))
    ;(request as Request & { cf?: unknown }).cf = proxy.cf

    event.context.cloudflare = {
      ...event.context.cloudflare,
      request,
      env: proxy.env,
      context: proxy.ctx,
    }

    ;(event.node.req as typeof event.node.req & { __unenv__?: { waitUntil?: unknown } }).__unenv__ = {
      ...(event.node.req as typeof event.node.req & { __unenv__?: { waitUntil?: unknown } }).__unenv__,
      waitUntil: event.context.waitUntil,
    }
  })

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
  const wrangler = runtimeConfig.wrangler as {
    configPath?: string
    persistDir?: string
    environment?: string
    envFiles?: string[]
    remoteBindings?: boolean
  } | undefined
  const proxyOptions: {
    configPath?: string
    persist?: { path: string }
    environment?: string
    envFiles?: string[]
    remoteBindings?: boolean
  } = {
    configPath: wrangler?.configPath,
    persist: { path: wrangler?.persistDir || '.wrangler/state/v3' },
    envFiles: wrangler?.envFiles,
    remoteBindings: wrangler?.remoteBindings,
  }

  if (wrangler?.environment) {
    proxyOptions.environment = wrangler.environment
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
