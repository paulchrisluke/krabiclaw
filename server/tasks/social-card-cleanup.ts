import type { CloudflareEnv } from '~/server/utils/auth'
import { queryAll } from '~/server/db'
import { assertCloudflareImagesConfigured } from '~/server/utils/cloudflare-images'
import { deleteMediaAsset } from '~/server/utils/media-asset-manager'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { isNonProductionHost, normalizeHost } from '~/server/utils/tenant-hosts'

// Regeneration never deletes the card it replaces: an environment regenerating
// a card may be running on a copy of production's rows, and the previous card
// is then production's. The superseded card is left unplaced, and this removes
// it in production only; non-production must not delete copied images even if
// credentials were supplied. Unplacing a card stamps its updated_at,
// so a card is kept for 30 days after it was last shown: Facebook, WhatsApp and
// the rest cache the og:image a link was shared with, and keep showing it.
// Hourly at 100 a run keeps ahead of regeneration; a card that keeps failing
// fails every run.
const CARDS_PER_RUN = 100
const SUPERSEDED_AFTER_MS = 30 * 24 * 60 * 60 * 1000

export default defineScheduledTask<{ skipped: string } | { deleted: number; hasMore: boolean }>({
  meta: { name: 'social-card-cleanup', description: 'Delete generated social cards that no longer have a placement' },
  async run({ context }) {
    const env = (context as { cloudflare?: { env?: CloudflareEnv } } | undefined)?.cloudflare?.env
    if (!env?.DB) throw new Error('DB is required')
    const platformHost = normalizeHost(env.NUXT_PUBLIC_PLATFORM_DOMAIN)
    if (!platformHost) throw new Error('NUXT_PUBLIC_PLATFORM_DOMAIN is required')
    if (isNonProductionHost(platformHost)) return { result: { skipped: 'Non-production environments do not delete social cards' } }
    assertCloudflareImagesConfigured(env)
    const cutoff = new Date(Date.now() - SUPERSEDED_AFTER_MS).toISOString()
    const superseded = await queryAll<{ id: string; organization_id: string }>(env.DB, `
      SELECT ma.id, ma.organization_id FROM media_assets ma
       WHERE ma.source = 'generated' AND ma.file_name = 'social-card.png' AND ma.status = 'active'
         AND ma.updated_at < ?
         AND NOT EXISTS (SELECT 1 FROM media_placements mp WHERE mp.asset_id = ma.id)
       ORDER BY ma.updated_at
       LIMIT ?
    `, [cutoff, CARDS_PER_RUN])
    const failures: string[] = []
    for (const card of superseded) {
      try {
        await deleteMediaAsset(env.DB, env, card.id, card.organization_id, null)
      } catch (error) {
        failures.push(`${card.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (failures.length) throw new Error(`social-card-cleanup: ${failures.length} of ${superseded.length} cards were not deleted: ${failures.join('; ')}`)
    return { result: { deleted: superseded.length, hasMore: superseded.length === CARDS_PER_RUN } }
  },
})
