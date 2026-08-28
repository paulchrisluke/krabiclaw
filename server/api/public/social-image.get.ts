// GET /api/public/social-image?ownerType=...&ownerId=... — client-side navigation fallback for
// useSocialMetadata()'s persisted OG card lookup. SSR uses loadPersistedSocialImage directly
// against the request's own D1 binding (see composables/useSocialMetadata.ts); this route exists
// only so client-side route changes (no full page reload) can re-resolve the same value. Reads
// only already-public, already-generated card metadata — nothing sensitive.
import { defineHandler } from 'nitro'
import { getQuery } from 'nitro/h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { loadPersistedSocialImage } from '~/server/utils/social-image-resolver'
import { MEDIA_PLACEMENT_SLOTS } from '~/shared/media-placement-contract'

export default defineHandler(async (event) => {
  const query = getQuery(event)
  const ownerType = typeof query.ownerType === 'string' ? query.ownerType : ''
  const ownerId = typeof query.ownerId === 'string' ? query.ownerId : ''
  if (!ownerType || !ownerId || !(ownerType in MEDIA_PLACEMENT_SLOTS)) {
    return jsonResponse({ error: 'ownerType and ownerId required' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const socialImage = await loadPersistedSocialImage(db, ownerType, ownerId)
  return jsonResponse({ socialImage })
})
