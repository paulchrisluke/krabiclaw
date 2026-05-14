// Content seeding utilities for Saya theme
// Generic restaurant content, not Kikuzuki-specific

export interface SeedContentData {
  organizationId: string
  siteId: string
  restaurantName: string
}

// Get platform domain from environment
function getPlatformDomain(): string {
  const domain = process.env.NUXT_PUBLIC_FREE_SITE_DOMAIN
  if (!domain) {
    throw new Error('NUXT_PUBLIC_FREE_SITE_DOMAIN environment variable is required for content seeding')
  }
  return domain
}

// Generic Saya theme content for new restaurants
export const getSayaThemeSeedContent = (data: SeedContentData) => {
  const now = new Date().toISOString()
  
  return [
    // Homepage content
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null, // Site-wide content
      page: 'home',
      field: 'hero.title',
      content: `Welcome to ${data.restaurantName}`,
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'home',
      field: 'hero.subtitle',
      content: 'Experience authentic flavors and warm hospitality',
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'home',
      field: 'hero.cta_title',
      content: 'Reserve Your Table',
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'home',
      field: 'hero.cta_description',
      content: 'Join us for an unforgettable dining experience',
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'home',
      field: 'about.title',
      content: 'Our Story',
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'home',
      field: 'about.description',
      content: 'We are passionate about creating exceptional dining experiences using the finest ingredients and traditional techniques.',
      type: 'textarea',
      updated_at: now
    },
    // Contact page content
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'contact',
      field: 'contact.phone',
      content: '+1 (555) 123-4567',
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'contact',
      field: 'contact.email',
      content: 'info@' + data.siteId + '.' + getPlatformDomain(),
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'contact',
      field: 'contact.address',
      content: '123 Restaurant Street, City, State 12345',
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'contact',
      field: 'contact.hours',
      content: 'Mon-Sun: 11:00 AM - 10:00 PM',
      type: 'text',
      updated_at: now
    },
    // SEO content
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'seo',
      field: 'meta.title',
      content: `${data.restaurantName} | Restaurant`,
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'seo',
      field: 'meta.description',
      content: `Experience exceptional dining at ${data.restaurantName}. Reserve your table today!`,
      type: 'text',
      updated_at: now
    }
  ]
}

