import type {
  SitemapInputCtx,
  SitemapRenderCtx,
  SitemapSourcesHookCtx,
} from '@nuxtjs/sitemap'

declare module 'nitro/types' {
  interface NitroRuntimeHooks {
    'sitemap:input': (_ctx: SitemapInputCtx) => void | Promise<void>
    'sitemap:resolved': (_ctx: SitemapRenderCtx) => void | Promise<void>
    'sitemap:sources': (_ctx: SitemapSourcesHookCtx) => void | Promise<void>
  }
}
