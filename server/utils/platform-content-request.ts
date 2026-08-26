import type { PlatformBlogCreateInput } from '~/server/utils/platform-content'
import type { PlatformBlogPostRequestBody, PlatformContentNavRequestBody } from '~/server/types/platform-content'

export function platformContentNavInput(
  body: PlatformContentNavRequestBody,
  options: { defaultHideFromNav?: boolean | number | null } = {},
): PlatformContentNavRequestBody {
  return {
    nav_section: body.nav_section ?? null,
    nav_title: body.nav_title ?? null,
    nav_order: body.nav_order ?? null,
    nav_section_order: body.nav_section_order ?? null,
    hide_from_nav: body.hide_from_nav ?? options.defaultHideFromNav ?? null,
    featured_order: body.featured_order ?? null,
  }
}

export function platformBlogCreateInput(body: PlatformBlogPostRequestBody): PlatformBlogCreateInput {
  return {
    title: body.title ?? '',
    slug: body.slug ?? null,
    content_blocks: body.content_blocks ?? [],
    excerpt: body.excerpt ?? null,
    category: body.category ?? null,
    tags: body.tags ?? null,
    ...platformContentNavInput(body, { defaultHideFromNav: false }),
    seo_title: body.seo_title ?? null,
    seo_description: body.seo_description ?? null,
    seo_keywords: body.seo_keywords ?? null,
    canonical_url: body.canonical_url ?? null,
    robots: body.robots ?? null,
    media: body.media,
    visibility: body.visibility ?? 'public',
    scheduled_for: body.scheduled_for ?? null,
  }
}
