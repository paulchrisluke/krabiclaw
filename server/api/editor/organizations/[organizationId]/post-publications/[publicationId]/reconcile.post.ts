import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { cloudflareEnv, jsonResponse, readStrictBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { loadMemberOrganizationRow } from '~/server/utils/location-access'
import { assertResourceAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { reconcilePostPublication } from '~/server/utils/social-publication'

/** The dashboard's reconcile_post_publication: read Meta, record only what it proves. */
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const publicationId = getRouterParam(event, 'publicationId')
  if (!organizationId || !publicationId) return jsonResponse({ error: 'Organization ID and publication ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readStrictBody<{ provider_post_id?: string }>(event, { provider_post_id: 'string' })
  const organization = await loadMemberOrganizationRow(event, db, env, organizationId, session.user.id)
  if (!organization) return jsonResponse({ error: 'Organization not found or access denied' }, { status: 404 })
  const scope = await queryFirst<{ location_id: string | null }>(db, `SELECT d.location_id FROM post_publications p JOIN content_documents d ON d.id = p.post_id
    WHERE p.organization_id = ? AND p.id = ?`, [organization.id, publicationId])
  if (!scope) return jsonResponse({ error: 'Publication not found' }, { status: 404 })
  await assertResourceAccess(db, { ...memberAccessPrincipal(organization.membership, { env, event }), resourceLocationId: scope.location_id })

  return jsonResponse(await reconcilePostPublication(env, organization.id, publicationId, body.provider_post_id?.trim() || null))
})
