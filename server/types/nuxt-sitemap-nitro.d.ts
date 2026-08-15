import type {
  SitemapInputCtx,
  SitemapRenderCtx,
  SitemapSourcesHookCtx,
} from '@nuxtjs/sitemap'

declare module 'nitro/types' {
  interface NitroRuntimeHooks {
    'sitemap:input': (ctx: SitemapInputCtx) => void | Promise<void>
    'sitemap:resolved': (ctx: SitemapRenderCtx) => void | Promise<void>
    'sitemap:sources': (ctx: SitemapSourcesHookCtx) => void | Promise<void>
  }
}
