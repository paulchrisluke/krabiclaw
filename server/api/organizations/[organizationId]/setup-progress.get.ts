// GET /api/organizations/[organizationId]/setup-progress
// Returns the ordered 10-step setup journey for the site overview card.
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { assertOrganizationWideAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { loadMemberOrganizationRow } from '~/server/utils/location-access'
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

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')

  if (!organizationId) {
    return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })
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
    const organizationAccess = await loadMemberOrganizationRow(event, db, env, organizationId, session.user.id)
    if (!organizationAccess) {
      return jsonResponse({ error: 'Organization not found or access denied' }, { status: 404 })
    }

    await assertOrganizationWideAccess(db, memberAccessPrincipal(organizationAccess.membership, { env, event }))

    const organization = await queryFirst<{
      id: string
      slug: string | null
      name: string | null
      brand_description: string | null
      has_logo: number
      contact_email: string | null
      subdomain: string | null
      public_url: string | null
      status: string
    }>(db, `
      SELECT s.id, ? AS slug, s.name, s.brand_description,
             EXISTS(SELECT 1 FROM media_placements mp JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active' WHERE mp.owner_type = 'organization' AND mp.owner_id = s.id AND mp.slot = 'logo' AND mp.status = 'active') AS has_logo,
             s.contact_email, s.subdomain, (SELECT 'https://' || domain FROM organization_domains WHERE organization_id = s.id AND role = 'canonical' AND status = 'active') AS public_url, s.status
      FROM organization s
      WHERE s.id = ?
      LIMIT 1
    `, [organizationAccess.slug, organizationId])

    if (!organization) {
      return jsonResponse({ error: 'Organization not found or access denied' }, { status: 404 })
    }


    const locationProgress = await queryFirst<{ count: number; missing_address: number; missing_hours: number }>(db, `
      SELECT COUNT(*) AS count,
             SUM(CASE WHEN address IS NULL THEN 1 ELSE 0 END) AS missing_address,
             SUM(CASE WHEN opening_hours IS NULL THEN 1 ELSE 0 END) AS missing_hours
      FROM business_locations WHERE organization_id = ? AND status = 'active'
    `, [organizationId])

    const productsResult = await queryFirst<{ count: number }>(db, `
      SELECT COUNT(DISTINCT p.id) as count
      FROM products p
      JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id AND pub.published = 1
      WHERE p.organization_id = ? AND p.active = 1
    `, [organizationId])
    const productCount = productsResult?.count ?? 0

    const photoCountResult = await queryFirst<{ count: number }>(db, `
      SELECT COUNT(*) AS count FROM media_placements mp
      JOIN media_assets ma ON ma.id = mp.asset_id AND ma.kind = 'image' AND ma.status = 'active'
      WHERE mp.organization_id = ? AND mp.owner_type = 'business_location' AND mp.slot = 'gallery' AND mp.status = 'active'
    `, [organizationId])
    const photoCount = photoCountResult?.count ?? 0

    const aboutContent = await queryFirst<{ id: string }>(db, `
      SELECT v.id
      FROM content_documents v
      JOIN content_blocks b ON b.document_id = v.id
      WHERE v.kind = 'page' AND v.row_role = 'root' AND v.organization_id = ? AND v.path = '/about'
        AND b.type = 'markdown'
        AND length(COALESCE(json_extract(b.data_json, '$.markdown'), '')) > 0
      LIMIT 1
    `, [organizationId])


    const hasLocations = Number(locationProgress?.count ?? 0) > 0
    const hasAddress = hasLocations && locationProgress?.missing_address === 0
    const hasHours = hasLocations && locationProgress?.missing_hours === 0
    const hasFiveProducts = productCount >= 5
    const hasLogo = Boolean(organization.has_logo)
    const hasBrandDescription = !!organization.brand_description
    const hasPhotos = photoCount >= 3
    const hasAboutPage = !!aboutContent
    const hasContactEmail = !!organization.contact_email
    if (!organization.slug) {
      return jsonResponse({ error: 'Organization routing context is incomplete' }, { status: 500 })
    }
    const organizationBase = `/dashboard/${organization.slug}`
    const locationsBase = `${organizationBase}/locations`

    const steps: SetupStep[] = [
      {
        id: 'organization_created', label: 'Organization created', description: 'Your restaurant site and subdomain are live.', done: true, required: true
      }, {
        id: 'locations', label: 'Location added', description: 'Add your restaurant\'s physical location so guests can find you.', done: hasLocations, required: true, action_url: `${locationsBase}/new`
      }, {
        id: 'location_address', label: 'Location address', description: 'A full address enables the map on your contact page.', done: hasAddress, required: true, action_url: locationsBase
      }, {
        id: 'opening_hours', label: 'Opening hours', description: 'Guests need to know when you\'re open.', done: hasHours, required: true, action_url: locationsBase
      }, {
        id: 'products', label: 'Products — at least 5 items', description: 'Add Products so guests know what you offer.', done: hasFiveProducts, required: true, action_url: locationsBase
      }, {
        id: 'logo', label: 'Logo', description: 'Upload your logo for a polished look across your site.', done: hasLogo, required: false, action_url: `${organizationBase}/settings`
      }, {
        id: 'brand_description', label: 'Brand description', description: 'A short tagline used in SEO and your homepage.', done: hasBrandDescription, required: false, action_url: `${organizationBase}/settings`
      }, {
        id: 'photos', label: 'At least 3 photos', description: 'Photos bring your restaurant to life.', done: hasPhotos, required: false, action_url: locationsBase
      }, {
        id: 'about_page', label: 'About page content', description: 'Tell your story — where you came from, what makes you special.', done: hasAboutPage, required: false, action_url: `${organizationBase}/pages`
      }, {
        id: 'contact_email', label: 'Contact email', description: 'Let guests reach you directly from your website.', done: hasContactEmail, required: false, action_url: `${organizationBase}/settings`
      }
    ]

    const requiredSteps = steps.filter(s => s.required)
    const recommendedSteps = steps.filter(s => !s.required)

    const progress: SetupProgress = {
      steps, required_complete: requiredSteps.filter(s => s.done).length, required_total: requiredSteps.length, recommended_complete: recommendedSteps.filter(s => s.done).length, recommended_total: recommendedSteps.length, can_publish: requiredSteps.every(s => s.done), public_url: organization.public_url
    }

    return jsonResponse({ success: true, progress })
  } catch (error) {
    rethrowHttpError(error)
    console.error('Failed to get setup progress:', error)
    return jsonResponse({ error: 'Failed to get setup progress' }, { status: 500 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
