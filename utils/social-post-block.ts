import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { isPublicSocialPost, type PublicSocialPost } from '~/utils/public-resource-contracts'
import { blockText } from '~/utils/tenant-page-block-data'

/**
 * What a social_posts block shows: its authored heading, description and
 * button — each absent when the author left it out — and the posts the page
 * loader read for it from the public feed.
 */
export function socialPostsBlockView(block: TenantPageBlock | undefined) {
  const data = block?.data ?? {}
  const action = data.call_to_action && typeof data.call_to_action === 'object' && !Array.isArray(data.call_to_action)
    ? data.call_to_action as Record<string, unknown>
    : null
  const label = blockText(action?.label)
  const url = blockText(action?.url)
  const posts = Array.isArray(data.posts) ? data.posts : []
  if (!posts.every(isPublicSocialPost)) throw new Error(`social_posts block ${block?.id} carries a malformed post`)
  return {
    title: blockText(data.title) || null,
    description: blockText(data.description) || null,
    callToAction: label && url ? { label, url } : null,
    posts: posts as PublicSocialPost[],
  }
}
