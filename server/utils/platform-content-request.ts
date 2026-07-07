import type { PlatformContentNavRequestBody } from '~/server/types/platform-content'

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
