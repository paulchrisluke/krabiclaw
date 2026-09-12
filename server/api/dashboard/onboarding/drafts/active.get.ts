// The owner's unfinished draft, so reloading /dashboard/onboarding picks up
// where they left off instead of asking every question again. Read-only: it
// resolves the pending site the draft already created but never creates one —
// that is the first save's job (active.post.ts).
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { parseOnboardingDraftPayload } from '~/server/utils/onboarding-drafts'
import { createPreviewToken, PREVIEW_TOKEN_TTL_MS, previewSecretOf } from '~/server/utils/preview-token'
import { defineHandler } from 'nitro'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const row = await queryFirst<{
    id: string
    organization_id: string | null
    subdomain_candidate: string | null
    source_type: string
    payload_json: string
  }>(db, `
    SELECT id, organization_id, subdomain_candidate, source_type, payload_json
    FROM onboarding_drafts
    WHERE user_id = ? AND status = 'active'
    LIMIT 1
  `, [session.user.id])

  if (!row) return jsonResponse({ success: true, draft: null })

  const payload = parseOnboardingDraftPayload(row.payload_json)
  if (!payload) return jsonResponse({ success: true, draft: null })

  const site = row.organization_id && row.subdomain_candidate
    ? await queryFirst<{ id: string; subdomain: string | null }>(db, `
        SELECT id, subdomain FROM sites
        WHERE organization_id = ? AND subdomain = ? AND onboarding_status = 'pending'
        LIMIT 1
      `, [row.organization_id, row.subdomain_candidate])
    : null

  // A draft older than the token's lifetime is still resumable; the token is
  // minted fresh on every read rather than stored with the draft.
  const previewSecret = previewSecretOf(env)
  const previewToken = site?.subdomain && previewSecret
    ? await createPreviewToken(previewSecret, site.id, Date.now() + PREVIEW_TOKEN_TTL_MS)
    : null

  return jsonResponse({
    success: true,
    draft: {
      draftId: row.id,
      draftName: payload.preview.brandName,
      sourceType: row.source_type,
      vertical: payload.preview.vertical,
      details: payload.source.details,
      config: payload.preview.config,
      products: payload.preview.products.map(product => ({
        name: product.name,
        category: product.collection,
        amountMinor: product.price === null ? null : product.price.unit_amount,
      })),
      siteId: site?.id ?? null,
      subdomainCandidate: site?.subdomain ?? row.subdomain_candidate,
      previewToken,
    },
  })
})
