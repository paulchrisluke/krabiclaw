/**
 * The robots contract.
 *
 * Nothing stores a robots value. A tenant never chooses one, and no table
 * carries a `robots` column: the directive that reaches `<meta name="robots">`
 * is derived from what the surface already is, which is the only thing that
 * could ever have justified the choice.
 *
 * There are three derived audiences, and the product's own rules pick between
 * them:
 *
 * - `listed` — content served publicly and offered to discovery. A live site's
 *   pages, a published listed article. Indexable, and carrying the preview
 *   directives Google reads for rich results.
 * - `unlisted` — published and reachable by direct URL, deliberately absent
 *   from indexes, search, feeds and the sitemap. Links out still count, so it
 *   follows.
 * - `private` — an authenticated preview, the dashboard, and every internal,
 *   auth and setup surface. Nothing about it is Google's to see.
 *
 * Draft and unpublished content has no entry here because it is not publicly
 * served at all; a directive is for a page a crawler can actually reach.
 */

/** What the served surface is allowed to be found by. */
export type RobotsVisibility = 'listed' | 'unlisted' | 'private'

/**
 * Preview directives served alongside indexable content. They are the
 * @nuxtjs/robots enabled value's directives, so the module's site-wide tag and
 * this contract agree byte for byte.
 */
export const ROBOTS_PREVIEW_DIRECTIVES = [
  'max-image-preview:large',
  'max-snippet:-1',
  'max-video-preview:-1',
] as const

/**
 * The served `<meta name="robots">` content for each audience. Only indexable
 * content carries the preview directives, because preview limits describe a
 * result that will not otherwise exist.
 */
export const ROBOTS_DIRECTIVES: Record<RobotsVisibility, string> = {
  listed: ['index', 'follow', ...ROBOTS_PREVIEW_DIRECTIVES].join(', '),
  unlisted: 'noindex, follow',
  private: 'noindex, nofollow',
}

/** A surface that says nothing about itself is public, listed content. */
export const DEFAULT_ROBOTS_VISIBILITY: RobotsVisibility = 'listed'

export function robotsDirective(visibility: RobotsVisibility | null | undefined): string {
  return ROBOTS_DIRECTIVES[visibility ?? DEFAULT_ROBOTS_VISIBILITY]
}

/** The directive @nuxtjs/robots must serve for a route it allows. */
export const ROBOTS_ENABLED_DIRECTIVE = ROBOTS_DIRECTIVES.listed

/** The directive @nuxtjs/robots must serve for a route it blocks. */
export const ROBOTS_DISABLED_DIRECTIVE = ROBOTS_DIRECTIVES.private
