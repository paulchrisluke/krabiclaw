import type { CloudflareEnv } from '~/server/utils/auth'
import { queryAll } from '~/server/db'
import { assertCloudflareImagesConfigured } from '~/server/utils/cloudflare-images'
import { deleteMediaAsset } from '~/server/utils/media-asset-manager'
import { defineScheduledTask } from '~/server/utils/scheduled-task'

// Regeneration never deletes the card it replaces: an environment regenerating
// a card may be running on a copy of production's rows, and the previous card
// is then production's. The superseded card is left unplaced, and this removes
// it where the Images credentials are — production only, which is why it fails
// with a clear error everywhere else.
const CARDS_PER_RUN = 100
const SUPERSEDED_AFTER_MS = 24 * 60 * 60 * 1000

export default defineScheduledTask({
  meta: { name: 'social-card-cleanup', description: 'Delete generated social cards that no longer have a placement' },
  async run({ context }) {
    const env = (context as { cloudflare?: { env?: CloudflareEnv } } | undefined)?.cloudflare?.env
    if (!env?.DB) throw new Error('DB is required')
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
