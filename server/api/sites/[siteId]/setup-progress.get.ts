// GET /api/sites/[siteId]/setup-progress
// Returns the ordered 10-step setup journey for the site overview card.
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { assertSiteWideAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'
import { queryFirst } from '~/server/db'

export interface SetupStep {
  id: string
  label: string
  description: string
  done: boolean
  required: boolean
  action_url?: string
}

export interface SetupProgress {
  steps: SetupStep[]
  required_complete: number
  required_total: number
  recommended_complete: number
  recommended_total: number
  can_publish: boolean
  public_url: string | null
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')

  if (!siteId) {
    return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB

  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const siteAccess = await loadMemberSiteRow(db, siteId, session.user.id)
    if (!siteAccess) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    await assertSiteWideAccess(db, {
      memberId: siteAccess.member_id,
      role: siteAccess.member_role,
      organizationId: siteAccess.organization_id,
      siteId,
    })

    const site = await queryFirst<{
      id: string
      organization_id: string
      organization_slug: string | null
      brand_name: string | null
      brand_description: string | null
      logo_url: string | null
      contact_email: string | null
      subdomain: string | null
      public_url: string | null
      status: string
      last_published_at: string | null
    }>(db, `
      SELECT s.id, s.organization_id, o.slug AS organization_slug, s.brand_name, s.brand_description,
             s.logo_url, s.contact_email, s.subdomain, s.public_url,
             s.status, s.last_published_at
      FROM sites s
      JOIN organization o ON o.id = s.organization_id
      WHERE s.id = ? AND s.organization_id = ?
      LIMIT 1
    `, [siteId, siteAccess.organization_id])

    if (!site) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    const orgId = site.organization_id

    // Fetch primary location
    const primaryLocation = await queryFirst<{
      id: string
      title: string | null
      address: string | null
      city: string | null
      phone: string | null
      opening_hours: string | null
      slug: string
    }>(db, `
      SELECT id, title, address, city, phone, opening_hours, slug
      FROM business_locations
      WHERE organization_id = ? AND site_id = ? AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1
    `, [orgId, siteId])

    // Count published menu items across all menus for this site
    const menuItemsResult = await queryFirst<{ count: number }>(db, `
      SELECT COUNT(mi.id) as count
      FROM menu_items mi
      JOIN menus m ON mi.menu_id = m.id
      WHERE m.site_id = ? AND m.organization_id = ? AND m.status = 'published' AND mi.available = 1
    `, [siteId, orgId])
    const menuItemCount = menuItemsResult?.count ?? 0

    // Count location photos from media_assets
    const photoCountResult = primaryLocation
      ? await queryFirst<{ count: number }>(db, `
          SELECT COUNT(*) as count FROM media_assets
          WHERE site_id = ? AND location_id = ? AND kind = 'image' AND status = 'active'
        `, [siteId, primaryLocation.id])
      : { count: 0 }
    const photoCount = photoCountResult?.count ?? 0

    // Check About page content
    const aboutContent = await queryFirst<{ id: string }>(db, `
      SELECT id FROM site_content
      WHERE site_id = ? AND organization_id = ? AND page = 'about' AND field = 'body'
        AND content IS NOT NULL AND content != ''
      LIMIT 1
    `, [siteId, orgId])

    // ─── Build the 10 steps ───────────────────────────────────────────────────

    const hasPrimaryLocation = !!primaryLocation
    const hasAddress = !!primaryLocation?.address || !!primaryLocation?.city
    const hasHours = !!primaryLocation?.opening_hours
    const hasFiveMenuItems = menuItemCount >= 5
    const hasLogo = !!site.logo_url
    const hasBrandDescription = !!site.brand_description
    const hasPhotos = photoCount >= 3
    const hasAboutPage = !!aboutContent
    const hasContactEmail = !!site.contact_email
    const orgSlug = site.organization_slug || site.organization_id
    const siteSlug = site.subdomain || site.id
    const siteBase = `/dashboard/${orgSlug}/sites/${siteSlug}`
    const locationsBase = `${siteBase}/locations`
    const locationBase = primaryLocation ? `${locationsBase}/${primaryLocation.slug}` : null

    const steps: SetupStep[] = [
      {
        id: 'site_created',
        label: 'Site created',
        description: 'Your restaurant site and subdomain are live.',
        done: true,
        required: true
      },
      {
        id: 'primary_location',
        label: 'Primary location added',
        description: 'Add your restaurant\'s physical location so guests can find you.',
        done: hasPrimaryLocation,
        required: true,
        action_url: `${locationsBase}/new`
      },
      {
        id: 'location_address',
        label: 'Location address',
        description: 'A full address enables the map on your contact page.',
        done: hasAddress,
        required: true,
        action_url: locationBase ? `${locationBase}/settings` : `${locationsBase}/new`
      },
      {
        id: 'opening_hours',
        label: 'Opening hours',
        description: 'Guests need to know when you\'re open.',
        done: hasHours,
        required: true,
        action_url: locationBase ? `${locationBase}/settings` : `${locationsBase}/new`
      },
      {
        id: 'menu_items',
        label: 'Menu — at least 5 items',
        description: 'Add menu items so guests know what to expect.',
        done: hasFiveMenuItems,
        required: true,
        action_url: locationBase
          ? `${locationBase}/menu`
          : `${locationsBase}/new`
      },
      {
        id: 'logo',
        label: 'Logo',
        description: 'Upload your logo for a polished look across your site.',
        done: hasLogo,
        required: false,
        action_url: `${siteBase}/settings`
      },
      {
        id: 'brand_description',
        label: 'Brand description',
        description: 'A short tagline used in SEO and your homepage.',
        done: hasBrandDescription,
        required: false,
        action_url: `${siteBase}/settings`
      },
      {
        id: 'photos',
        label: 'At least 3 photos',
        description: 'Photos bring your restaurant to life.',
        done: hasPhotos,
        required: false,
        action_url: locationBase ? `${locationBase}/photos` : `${locationsBase}/new`
      },
      {
        id: 'about_page',
        label: 'About page content',
        description: 'Tell your story — where you came from, what makes you special.',
        done: hasAboutPage,
        required: false,
        action_url: `${siteBase}/content/about`
      },
      {
        id: 'contact_email',
        label: 'Contact email',
        description: 'Let guests reach you directly from your website.',
        done: hasContactEmail,
        required: false,
        action_url: `${siteBase}/settings`
      }
    ]

    const requiredSteps = steps.filter(s => s.required)
    const recommendedSteps = steps.filter(s => !s.required)

    const progress: SetupProgress = {
      steps,
      required_complete: requiredSteps.filter(s => s.done).length,
      required_total: requiredSteps.length,
      recommended_complete: recommendedSteps.filter(s => s.done).length,
      recommended_total: recommendedSteps.length,
      can_publish: requiredSteps.every(s => s.done),
      public_url: site.public_url
    }

    return jsonResponse({ success: true, progress })
  } catch (error) {
    rethrowHttpError(error)
    console.error('Failed to get setup progress:', error)
    return jsonResponse({ error: 'Failed to get setup progress' }, { status: 500 })
  }
})
