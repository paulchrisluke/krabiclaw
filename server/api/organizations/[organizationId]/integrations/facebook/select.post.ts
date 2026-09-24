import { jsonResponse } from '~/server/utils/api-response'
import {
  clearPendingPageSelection, readPendingPageSelection, storeFacebookPagesConnection,
} from '~/server/utils/facebook-pages'
import { requireOrganizationAccess } from '~/server/utils/location-access'

/**
 * The tenant's answer to "which Page". This is the only thing that writes a
 * Facebook connection when the authorization returned more than one, so a Page
 * is connected because somebody chose it.
 */
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })

  const body = await readBody<{ handle?: string; page_id?: string }>(event).catch(() => null)
  const handle = body?.handle?.trim()
  const pageId = body?.page_id?.trim()
  if (!handle || !pageId) return jsonResponse({ error: 'Choose a Facebook Page.' }, { status: 400 })

  const { env, organization} = await requireOrganizationAccess(event, organizationId)

  const pending = await readPendingPageSelection(env, handle)
  if (!pending || pending.organizationId !== organization.id) {
    return jsonResponse({ error: 'That Facebook authorization has expired. Connect again.' }, { status: 410 })
  }

  const page = pending.pages.find(candidate => candidate.id === pageId)
  if (!page) return jsonResponse({ error: 'That Page was not part of this authorization.' }, { status: 400 })

  try {
    await storeFacebookPagesConnection(env, {
      organization_id: pending.organizationId,
      connected_by_user_id: pending.userId,
      facebook_user_id: pending.facebookUserId,
      page_id: page.id,
      page_name: page.name,
      encrypted_user_token: pending.userToken,
      encrypted_page_token: page.access_token,
      user_token_expires_at: undefined,
      scopes: undefined,
      status: 'active',
    }, { revision: pending.revision })
  } finally {
    // The tokens are spent either way: a failed write must not leave them
    // sitting in the cache for the rest of the window.
    await clearPendingPageSelection(env, handle)
  }

  return jsonResponse({ success: true, page_id: page.id, page_name: page.name })
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody } from 'nitro/h3';
