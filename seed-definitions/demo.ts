import { compileCuratedSiteFixture } from './compile.ts'
import type { CuratedSiteDefinition } from './contracts.ts'
import { renderSiteBillingSql, renderSiteEntitlementsSql } from './billing-sql.ts'

function escapeSql(value: string): string {
  return value.replace(/'/g, "''")
}

function sqlValue(value: string | number | boolean | null): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${escapeSql(value)}'`
}

function sqlJson(value: unknown): string {
  return sqlValue(JSON.stringify(value))
}

export const demoFixture: CuratedSiteDefinition = {
  fixtureId: 'demo',
  organizationId: 'org-demo',
  siteId: 'site-demo',
  site: {
    slug: 'ember-slice-demo',
    subdomain: 'demo',
    brandName: 'Ember & Slice',
    themeId: 'saya-theme-v1',
    theme: 'saya',
    brandDescription:
      'A Brooklyn wood-fired trattoria serving blistered pies, seasonal antipasti, and easy neighborhood hospitality.',
    status: 'active',
    plan: 'free',
    onboardingStatus: 'active',
    urlStructure: 'location_subdirectories',
    primaryLocationId: 'loc-demo',
    contactEmail: 'hello@emberandslice.example',
    defaultCurrency: 'USD',
    vertical: 'restaurant',
    contentSource: 'generated',
    mediaSource: 'stock',
  },
  siteConfig: [
    { key: 'source_locale', value: 'en' },
    { key: 'brand_color', value: '#1E40AF' }, // Test blue color to verify configurability
  ],
  siteLocales: [
    {
      id: 'locale::org-demo::site-demo::en',
      locale: 'en',
      label: 'English',
      isSource: true,
      status: 'published',
      fallbackEnabled: true,
    },
    {
      id: 'locale::org-demo::site-demo::th',
      locale: 'th',
      label: 'ไทย',
      isSource: false,
      status: 'published',
      fallbackEnabled: true,
    },
  ],
  siteDomains: [
    {
      id: 'domain-demo-local',
      domain: 'demo.localhost',
      type: 'subdomain',
      role: 'secondary',
      status: 'active',
      dnsStatus: 'valid',
    },
    {
      id: 'domain-demo-prod',
      domain: 'demo.krabiclaw.com',
      type: 'subdomain',
      role: 'canonical',
      status: 'active',
      dnsStatus: 'valid',
    },
  ],
  locations: [
    {
      id: 'loc-demo',
      slug: 'brooklyn',
      title: 'Ember & Slice Brooklyn',
      city: 'Brooklyn',
      address: {
        addressLines: ['184 Wythe Ave'],
        locality: 'Brooklyn',
        administrativeArea: 'NY',
        postalCode: '11249',
        country: 'US',
      },
      phone: '(718) 555-0148',
      email: 'hello@emberandslice.example',
      mapsUrl: 'https://maps.app.goo.gl/ember-slice-brooklyn',
      latitude: 40.7193,
      longitude: -73.9618,
      description:
        'A Brooklyn wood-fired trattoria built around blistered sourdough pies, bright antipasti, and an open oven that runs from lunch through late dinner.',
      shortDescription:
        'Wood-fired pizza, seasonal antipasti, and warm neighborhood hospitality in Brooklyn.',
      openingHours: [
        { openDay: 'MONDAY', openTime: '12:00', closeTime: '22:00' },
        { openDay: 'TUESDAY', openTime: '12:00', closeTime: '22:00' },
        { openDay: 'WEDNESDAY', openTime: '12:00', closeTime: '22:00' },
        { openDay: 'THURSDAY', openTime: '12:00', closeTime: '22:00' },
        { openDay: 'FRIDAY', openTime: '12:00', closeTime: '23:00' },
        { openDay: 'SATURDAY', openTime: '11:00', closeTime: '23:00' },
        { openDay: 'SUNDAY', openTime: '11:00', closeTime: '21:00' },
      ],
      rating: 4.8,
      reviewCount: 188,
      priceLevel: '$$',
      categories: ['Pizza', 'Italian Restaurant', 'Wood-fired Trattoria'],
      instagramUrl: 'https://instagram.com/emberandslice',
      facebookUrl: 'https://facebook.com/emberandslice',
      isPrimary: true,
      status: 'active',
      heroImageAssetId: 'media-demo-hero',
      heroVideoAssetId: 'media-demo-pizza-prep-video',
    },
    {
      id: 'loc-demo-2',
      slug: 'west-village',
      title: 'Ember & Slice West Village',
      city: 'New York',
      address: {
        addressLines: ['100 7th Ave S'],
        locality: 'New York',
        administrativeArea: 'NY',
        postalCode: '10014',
        country: 'US',
      },
      phone: '(212) 555-0199',
      email: 'hello@emberandslice.example',
      mapsUrl: 'https://maps.app.goo.gl/ember-slice-west-village',
      latitude: 40.7335,
      longitude: -74.0027,
      description:
        'Our signature wood-fired pies and warm hospitality, brought to the heart of the West Village.',
      shortDescription:
        'Wood-fired pizza, seasonal antipasti, and neighborhood hospitality in the West Village.',
      openingHours: [
        { openDay: 'MONDAY', openTime: '16:00', closeTime: '23:00' },
        { openDay: 'TUESDAY', openTime: '16:00', closeTime: '23:00' },
        { openDay: 'WEDNESDAY', openTime: '16:00', closeTime: '23:00' },
        { openDay: 'THURSDAY', openTime: '16:00', closeTime: '23:00' },
        { openDay: 'FRIDAY', openTime: '15:00', closeTime: '23:59' },
        { openDay: 'SATURDAY', openTime: '15:00', closeTime: '23:59' },
        { openDay: 'SUNDAY', openTime: '15:00', closeTime: '23:00' },
      ],
      rating: 4.9,
      reviewCount: 112,
      priceLevel: '$$',
      categories: ['Pizza', 'Italian Restaurant', 'Trattoria'],
      instagramUrl: 'https://instagram.com/emberandslice',
      facebookUrl: 'https://facebook.com/emberandslice',
      isPrimary: false,
      status: 'active',
      heroImageAssetId: 'media-demo2-hero',
    },
  ],
  mediaAssets: [
    // Loc-demo: hero + video assets
    {
      id: 'media-demo-hero',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '0762ea49-0bd2-4cc8-1044-d6c9b1f00100',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0762ea49-0bd2-4cc8-1044-d6c9b1f00100/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0762ea49-0bd2-4cc8-1044-d6c9b1f00100/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'wood-fired-pizza-hero.jpg',
      altText: 'Wood-fired pizza with blistered crust',
      category: 'food',
    },
    {
      id: 'media-demo-hero-video',
      locationId: 'loc-demo',
      kind: 'video',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-demo/media/media-demo-hero-video.mp4',
      publicUrl: 'https://media.krabiclaw.com/sites/site-demo/media/media-demo-hero-video.mp4',
      thumbnailUrl: null,
      mimeType: 'video/mp4',
      fileName: 'krabiclaw-demo-hero-video.mp4',
      altText: 'Hero background video of the restaurant',
      category: 'interior',
    },
    {
      id: 'media-demo-margherita-video',
      locationId: 'loc-demo',
      kind: 'video',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-demo/media/media-demo-margherita-video.mp4',
      publicUrl: 'https://media.krabiclaw.com/sites/site-demo/media/media-demo-margherita-video.mp4',
      thumbnailUrl: null,
      mimeType: 'video/mp4',
      fileName: 'krabiclaw-demo-pizza-cutting.mp4',
      altText: 'Fresh Margherita pizza being cut',
      category: 'food',
    },
    {
      id: 'media-demo-pizza-prep-video',
      locationId: 'loc-demo',
      kind: 'video',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-demo/media/media-demo-pizza-prep-video.mp4',
      publicUrl: 'https://media.krabiclaw.com/sites/site-demo/media/media-demo-pizza-prep-video.mp4',
      thumbnailUrl: null,
      mimeType: 'video/mp4',
      fileName: 'krabiclaw-demo-pizza-prep.mp4',
      altText: 'Pizza dough being prepared and wood-fired',
      category: 'interior',
    },
    // Loc-demo: exterior
    {
      id: 'media-demo-ext-1',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '6ad28d44-8997-46b8-3a06-87833c65c000',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/6ad28d44-8997-46b8-3a06-87833c65c000/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/6ad28d44-8997-46b8-3a06-87833c65c000/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'brooklyn-storefront.jpg',
      altText: 'Neighborhood restaurant storefront',
      category: 'exterior',
    },
    {
      id: 'media-demo-ext-2',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: 'e7db135b-cd81-4b15-aa22-a07f24d0b900',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/e7db135b-cd81-4b15-aa22-a07f24d0b900/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/e7db135b-cd81-4b15-aa22-a07f24d0b900/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'evening-entrance.jpg',
      altText: 'Warm trattoria entrance at night',
      category: 'exterior',
    },
    // Loc-demo: interior
    {
      id: 'media-demo-int-1',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: 'fd99958c-6feb-47da-3040-bf5c56705e00',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/fd99958c-6feb-47da-3040-bf5c56705e00/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/fd99958c-6feb-47da-3040-bf5c56705e00/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'dining-room.jpg',
      altText: 'Cozy Brooklyn dining room',
      category: 'interior',
    },
    {
      id: 'media-demo-int-2',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '03e7f501-7689-4607-3acb-ec6f0d958500',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/03e7f501-7689-4607-3acb-ec6f0d958500/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/03e7f501-7689-4607-3acb-ec6f0d958500/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'oven-counter.jpg',
      altText: 'Open kitchen counter near the oven',
      category: 'interior',
    },
    {
      id: 'media-demo-int-3',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '01f1ec1c-1440-41d1-5323-1cf279b10600',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/01f1ec1c-1440-41d1-5323-1cf279b10600/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/01f1ec1c-1440-41d1-5323-1cf279b10600/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'table-service.jpg',
      altText: 'Table set for trattoria service',
      category: 'interior',
    },
    // Loc-demo: team
    {
      id: 'media-demo-team-1',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: 'b877d25c-e835-48b8-1faf-00e0c4614000',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/b877d25c-e835-48b8-1faf-00e0c4614000/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/b877d25c-e835-48b8-1faf-00e0c4614000/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'pizza-team.jpg',
      altText: 'Ember & Slice kitchen team',
      category: 'team',
    },
    // Loc-demo: menu food
    {
      id: 'media-demo-margherita',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '59e0fb6a-06dc-400c-9b38-5cd2d957bd00',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/59e0fb6a-06dc-400c-9b38-5cd2d957bd00/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/59e0fb6a-06dc-400c-9b38-5cd2d957bd00/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'margherita.jpg',
      altText: 'Margherita pizza with basil',
      category: 'food',
    },
    {
      id: 'media-demo-pepperoni',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '0d5c6306-8783-475c-ae49-d40be5783c00',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0d5c6306-8783-475c-ae49-d40be5783c00/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0d5c6306-8783-475c-ae49-d40be5783c00/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'pepperoni-calabrese.jpg',
      altText: 'Pepperoni Calabrese pizza',
      category: 'food',
    },
    {
      id: 'media-demo-funghi',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: 'a352e160-d8b2-443f-a539-0c585f1fda00',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/a352e160-d8b2-443f-a539-0c585f1fda00/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/a352e160-d8b2-443f-a539-0c585f1fda00/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'funghi-bianco.jpg',
      altText: 'Mushroom white pizza',
      category: 'food',
    },
    {
      id: 'media-demo-burrata',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: 'cca97463-0109-4ea6-60dd-64001fd87d00',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/cca97463-0109-4ea6-60dd-64001fd87d00/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/cca97463-0109-4ea6-60dd-64001fd87d00/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'burrata.jpg',
      altText: 'Burrata with tomatoes and herbs',
      category: 'food',
    },
    {
      id: 'media-demo-knots',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: 'af94834c-67b7-4dc9-a893-564ffcd2cf00',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/af94834c-67b7-4dc9-a893-564ffcd2cf00/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/af94834c-67b7-4dc9-a893-564ffcd2cf00/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'garlic-knots.jpg',
      altText: 'Garlic knots with marinara',
      category: 'food',
    },
    // Loc-demo: post images
    {
      id: 'media-demo-post1',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '294bda34-8a59-4f17-623b-e2a5feec7c00',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/294bda34-8a59-4f17-623b-e2a5feec7c00/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/294bda34-8a59-4f17-623b-e2a5feec7c00/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'post-oven.jpg',
      altText: 'Pizza coming out of the oven',
      category: 'food',
    },
    {
      id: 'media-demo-post2',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '276a3c4d-9bfe-45bd-90e7-85899356f700',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/276a3c4d-9bfe-45bd-90e7-85899356f700/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/276a3c4d-9bfe-45bd-90e7-85899356f700/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'post-dining-room.jpg',
      altText: 'Dining room during dinner service',
      category: 'interior',
    },
    {
      id: 'media-demo-post3',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '1246e510-65ce-4335-1309-0353b47ae100',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/1246e510-65ce-4335-1309-0353b47ae100/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/1246e510-65ce-4335-1309-0353b47ae100/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'post-margherita.jpg',
      altText: 'Margherita pizza special',
      category: 'food',
    },
    // Loc-demo-2: assets
    {
      id: 'media-demo2-hero',
      locationId: 'loc-demo-2',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: 'e3ac3094-6e43-4ffe-7659-67365cc21d00',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/e3ac3094-6e43-4ffe-7659-67365cc21d00/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/e3ac3094-6e43-4ffe-7659-67365cc21d00/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'west-village-hero.jpg',
      altText: 'West Village restaurant storefront',
      category: 'exterior',
    },
    {
      id: 'media-demo2-int-1',
      locationId: 'loc-demo-2',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: 'e76fe844-f1e0-4fcd-c1ed-8f9ad2dd6700',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/e76fe844-f1e0-4fcd-c1ed-8f9ad2dd6700/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/e76fe844-f1e0-4fcd-c1ed-8f9ad2dd6700/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'west-village-interior.jpg',
      altText: 'Cozy West Village dining room',
      category: 'interior',
    },
    // Experience media
    {
      id: 'media-demo-exp-class',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '245066b6-926f-4dbb-e731-53ebb0e22700',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/245066b6-926f-4dbb-e731-53ebb0e22700/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/245066b6-926f-4dbb-e731-53ebb0e22700/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'pizza-making-class.jpg',
      altText: 'Guests shaping pizza dough at a hands-on pizza making class',
      category: 'food',
    },
    {
      id: 'media-demo-exp-wine',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '9b3d4f55-4b43-4a98-40d4-225947dc7300',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/9b3d4f55-4b43-4a98-40d4-225947dc7300/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/9b3d4f55-4b43-4a98-40d4-225947dc7300/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'natural-wine-pizza-night.jpg',
      altText: 'Pizza and wine set for a long-table dinner evening',
      category: 'interior',
    },
    {
      id: 'media-demo-exp-family',
      locationId: 'loc-demo',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '0b7af787-3380-4adc-2804-17792dd73300',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0b7af787-3380-4adc-2804-17792dd73300/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0b7af787-3380-4adc-2804-17792dd73300/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'family-pizza-night.jpg',
      altText: 'Family-style dinner table set for pizza night',
      category: 'interior',
    },
  ],
  siteContent: [
    // Home page
    {
      id: 'sc-demo-home-hero',
      locationId: null,
      page: 'home',
      field: 'hero',
      content: null,
      heroTitle: 'Wood fire. Brooklyn nights.',
      heroSubtitle: 'Blistered pies & warm neighborhood vibes.',
      heroImageAssetId: 'media-demo-hero',
      heroVideoAssetId: 'media-demo-hero-video',
      type: 'text',
    },
    {
      id: 'sc-demo-cta',
      locationId: null,
      page: 'home',
      field: 'cta.title',
      content: 'Book a table near the oven.',
      type: 'text',
    },
    // About page
    {
      id: 'sc-demo-story-image',
      locationId: null,
      page: 'about',
      field: 'story.image',
      content: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/cad82f19-5ecd-43cd-8781-606a59256000/public',
      type: 'media',
    },
    {
      id: 'sc-demo-story-title',
      locationId: null,
      page: 'about',
      field: 'story.title',
      content: 'A trattoria shaped by the oven.',
      type: 'text',
    },
    {
      id: 'sc-demo-story-body',
      locationId: null,
      page: 'about',
      field: 'story.body',
      content:
        'Ember & Slice started with a sourdough starter, a borrowed mixer, and a pop-up oven behind a Brooklyn wine bar. The pies sold out before sunset, then again the next weekend, and then every weekend after that.\n\nToday the room is permanent, but the promise is the same: slow dough, live fire, seasonal produce, and the kind of service that makes a weeknight feel like an occasion.',
      type: 'richtext',
    },
    {
      id: 'sc-demo-journey',
      locationId: null,
      page: 'about',
      field: 'journey.body',
      content:
        'We cold-ferment our dough, stretch every pie to order, and cook it hot enough for a crisp rim and a tender center. The menu changes around the market, but the Margherita never leaves the board.\n\nThe oven anchors the room. Everything else moves around it.',
      type: 'textarea',
    },
    {
      id: 'sc-demo-experience',
      locationId: null,
      page: 'about',
      field: 'experience.body',
      content:
        'Come for a quick counter pie, stay for antipasti and another round, or bring a group and let the table fill itself. Ember & Slice is casual by design, but the details matter.\n\nGood tomatoes. Good flour. Good fire. No shortcuts.',
      type: 'textarea',
    },
    // Experiences page
    {
      id: 'sc-demo-exp-kicker',
      locationId: null,
      page: 'experiences',
      field: 'hero.kicker',
      content: 'Experiences',
      type: 'text',
    },
    {
      id: 'sc-demo-exp-title',
      locationId: null,
      page: 'experiences',
      field: 'hero.title',
      content: 'Pizza classes, tasting nights, and big-table evenings.',
      type: 'text',
    },
    {
      id: 'sc-demo-exp-subtitle',
      locationId: null,
      page: 'experiences',
      field: 'hero.subtitle',
      content: 'Book a hands-on pizza class, a natural wine pairing night, or a family-style evening built around the oven.',
      type: 'textarea',
    },
  ],
  experiences: [
    {
      id: 'exp-demo-pizza-class',
      locationId: 'loc-demo',
      title: 'Pizza Making Class',
      slug: 'pizza-making-class',
      tagline: 'Stretch dough, top your pie, and fire it yourself.',
      body:
        'Our flagship pizza making class brings guests right up to the bench and oven. You will learn how we stretch our dough, build a balanced pie, and work with high-heat live fire without feeling rushed.\n\nEach booking includes dough, toppings, one personal pizza, and a glass of house wine or sparkling lemonade. Great for couples, visitors, and anyone who wants a hands-on dinner plan in Brooklyn.',
      imageAssetId: 'media-demo-exp-class',
      price: '$95 per guest',
      priceAmount: 95,
      durationMinutes: 120,
      maxCapacity: 10,
      timeSlots: ['14:00', '18:00'],
      availableNote: 'Thursday to Sunday. Advance booking recommended.',
      status: 'active',
      sortOrder: 1,
      featured: true,
      featuredSortOrder: 1,
      seoTitle: 'Pizza Making Class Brooklyn | Ember & Slice',
      seoDescription:
        'Book a hands-on pizza making class at Ember & Slice in Brooklyn. Stretch dough, build your pie, and fire it in our oven.',
    },
    {
      id: 'exp-demo-wine-night',
      locationId: 'loc-demo',
      title: 'Natural Wine & Pizza Night',
      slug: 'natural-wine-and-pizza-night',
      tagline: 'Small pours, hot pies, and long-table energy.',
      body:
        'This evening is part tasting, part dinner party. We pair a rotating lineup of natural wines with off-menu pies, seasonal antipasti, and a little background on why each pairing works.\n\nBest for date nights, visiting friends, and anyone who wants the room at its loudest and warmest. Seats are shared at the table, and the menu changes with the week.',
      imageAssetId: 'media-demo-exp-wine',
      price: '$78 per guest',
      priceAmount: 78,
      durationMinutes: 150,
      maxCapacity: 16,
      timeSlots: ['19:30'],
      availableNote: 'Fridays only. Shared table seating.',
      status: 'active',
      sortOrder: 2,
      featured: true,
      featuredSortOrder: 2,
      seoTitle: 'Natural Wine & Pizza Night Brooklyn | Ember & Slice',
      seoDescription:
        'Reserve Natural Wine & Pizza Night at Ember & Slice in Brooklyn for curated pours, seasonal pies, and a long-table dinner.',
    },
    {
      id: 'exp-demo-family-night',
      locationId: 'loc-demo',
      title: 'Family Pizza Night',
      slug: 'family-pizza-night',
      tagline: 'Big-table dinner, easy pacing, and pizza for all ages.',
      body:
        'Family Pizza Night is our easiest way to turn a Sunday dinner into something a little more memorable. Kids shape mini pies, grown-ups share large-format pizzas and salads, and the kitchen keeps the pacing relaxed.\n\nIdeal for families, birthday dinners, and mixed-age groups who want an experience that feels special without feeling formal.',
      imageAssetId: 'media-demo-exp-family',
      price: '$140 per table',
      priceAmount: 140,
      durationMinutes: 105,
      maxCapacity: 6,
      timeSlots: ['17:00', '18:30'],
      availableNote: 'Sundays only. Best for groups of 4 to 6.',
      status: 'active',
      sortOrder: 3,
      featured: true,
      featuredSortOrder: 3,
      seoTitle: 'Family Pizza Night Brooklyn | Ember & Slice',
      seoDescription:
        'Book Family Pizza Night at Ember & Slice in Brooklyn for a relaxed group dinner built around the oven.',
    },
  ],
  reviews: [
    {
      id: 'rev-demo-1',
      locationId: 'loc-demo',
      authorName: 'Maya R.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/45239b3d-625e-49da-e751-a5ff8cc7e700/public',
      rating: 5,
      content: 'The Margherita had that perfect leopard-spotted crust and the basil hit the table smelling fresh. Exactly what I want from a neighborhood pizza night.',
      ownerReply: null,
      ownerReplyAt: null,
      status: 'approved',
      source: 'google',
    },
    {
      id: 'rev-demo-2',
      locationId: 'loc-demo',
      authorName: 'Julian P.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/699707fd-1559-4dc9-b115-3fe4a753aa00/public',
      rating: 5,
      content: 'Sat at the counter and watched the oven all night. Pepperoni Calabrese, burrata, and a spritz made this feel like a tiny vacation.',
      ownerReply: 'Thank you Julian. The counter seats are our favorite too - come back for the Funghi Bianco next time.',
      ownerReplyAt: '2026-04-22T09:15:00.000Z',
      status: 'approved',
      source: 'google',
    },
    {
      id: 'rev-demo-3',
      locationId: 'loc-demo',
      authorName: 'Priya S.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/6e004069-4d01-4709-34bd-d1a0cacc4600/public',
      rating: 4,
      content: 'Great crust, warm service, and the garlic knots vanished before the pizza landed. It gets loud at peak dinner but in a good way.',
      ownerReply: 'Thanks Priya. Dinner definitely has energy, and we are glad the knots did their job.',
      ownerReplyAt: '2026-04-15T11:30:00.000Z',
      status: 'approved',
      source: 'google',
    },
    {
      id: 'rev-demo-4',
      locationId: 'loc-demo',
      authorName: 'Noah L.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/ee18283c-d024-4bf0-15a5-73fc6c321e00/public',
      rating: 5,
      content: 'The hot honey soppressata is ridiculous. Sweet, spicy, smoky, and somehow still balanced. Best pie I have had in Williamsburg this year.',
      ownerReply: null,
      ownerReplyAt: null,
      status: 'approved',
      source: 'google',
    },
    {
      id: 'rev-demo-5',
      locationId: 'loc-demo',
      authorName: 'Elena C.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/b010933f-cac7-420f-1b4e-130b3b01ca00/public',
      rating: 4,
      content: 'Lovely date-night spot without feeling precious. Caesar was sharp and cold, pizza was blistered, staff knew the menu well.',
      ownerReply: null,
      ownerReplyAt: null,
      status: 'approved',
      source: 'google',
    },
    {
      id: 'rev-demo-6',
      locationId: 'loc-demo',
      authorName: 'Chris B.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/6413ee7e-ca8d-4616-00f4-8a4224217a00/public',
      rating: 3,
      content: 'Food was strong but our table was about 15 minutes late on a busy Friday. I would come earlier next time.',
      ownerReply: 'Hi Chris - sorry for the Friday wait. We tightened our turn times and would love to host you again on a smoother night.',
      ownerReplyAt: '2026-03-30T14:45:00.000Z',
      status: 'approved',
      source: 'google',
    },
    {
      id: 'rev-demo2-1',
      locationId: 'loc-demo-2',
      authorName: 'Michael T.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/ee18283c-d024-4bf0-15a5-73fc6c321e00/public',
      rating: 5,
      content: 'Unbelievable sourdough pizza right in the West Village! The Margherita is simple, fresh, and perfectly charred. Truly a hidden gem.',
      ownerReply: 'Thank you Michael! We are thrilled you enjoyed the neighborhood vibes and our signature crust.',
      ownerReplyAt: '2026-05-15T12:00:00.000Z',
      status: 'approved',
      source: 'google',
    },
    {
      id: 'rev-demo2-2',
      locationId: 'loc-demo-2',
      authorName: 'Emma W.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/45239b3d-625e-49da-e751-a5ff8cc7e700/public',
      rating: 5,
      content: 'Beautiful space, exceptionally friendly service, and a fantastic corner view. Highly recommend the Burrata and the Hot Honey pie!',
      ownerReply: null,
      ownerReplyAt: null,
      status: 'approved',
      source: 'google',
    },
  ],
  menus: [
    {
      id: 'menu-demo',
      locationId: 'loc-demo',
      name: 'Menu',
      description: 'Wood-fired pizza, antipasti, salads, and drinks from the Ember & Slice oven.',
      sectionOrder: ['Wood-Fired Pizza', 'Antipasti', 'Pasta & Salads', 'Drinks'],
      status: 'published',
      items: [
        {
          id: 'mi-1',
          section: 'Wood-Fired Pizza',
          name: 'Margherita',
          slug: 'margherita',
          description: 'San Marzano tomato, fior di latte, basil, extra virgin olive oil, sea salt',
          priceAmount: 18,
          imageAssetId: 'media-demo-margherita',
          allergens: 'Gluten, Dairy',
          dietaryNotes: 'Vegetarian',
          available: true,
          sortOrder: 1,
        },
        {
          id: 'mi-2',
          section: 'Wood-Fired Pizza',
          name: 'Pepperoni Calabrese',
          slug: 'pepperoni-calabrese',
          description: 'Tomato, mozzarella, cupping pepperoni, Calabrian chile, oregano',
          priceAmount: 21,
          imageAssetId: 'media-demo-pepperoni',
          allergens: 'Gluten, Dairy',
          dietaryNotes: null,
          available: true,
          sortOrder: 2,
        },
        {
          id: 'mi-3',
          section: 'Wood-Fired Pizza',
          name: 'Funghi Bianco',
          slug: 'funghi-bianco',
          description: 'Roasted mushrooms, ricotta crema, garlic, thyme, mozzarella, pecorino',
          priceAmount: 22,
          imageAssetId: 'media-demo-funghi',
          allergens: 'Gluten, Dairy',
          dietaryNotes: 'Vegetarian',
          available: true,
          sortOrder: 3,
        },
        {
          id: 'mi-4',
          section: 'Wood-Fired Pizza',
          name: 'Soppressata Hot Honey',
          slug: 'soppressata-hot-honey',
          description: 'Spicy soppressata, tomato, mozzarella, pickled Fresno chile, Brooklyn hot honey',
          priceAmount: 23,
          imageAssetId: null,
          allergens: 'Gluten, Dairy',
          dietaryNotes: null,
          available: true,
          sortOrder: 4,
        },
        {
          id: 'mi-5',
          section: 'Antipasti',
          name: 'Burrata',
          slug: 'burrata',
          description: 'Creamy burrata, roasted cherry tomatoes, basil oil, grilled sourdough',
          priceAmount: 16,
          imageAssetId: 'media-demo-burrata',
          allergens: 'Gluten, Dairy',
          dietaryNotes: 'Vegetarian',
          available: true,
          sortOrder: 1,
        },
        {
          id: 'mi-6',
          section: 'Antipasti',
          name: 'Garlic Knots',
          slug: 'garlic-knots',
          description: 'Wood-fired knots, parsley, roasted garlic butter, marinara',
          priceAmount: 9,
          imageAssetId: 'media-demo-knots',
          allergens: 'Gluten, Dairy',
          dietaryNotes: 'Vegetarian',
          available: true,
          sortOrder: 2,
        },
        {
          id: 'mi-7',
          section: 'Pasta & Salads',
          name: 'Little Gem Caesar',
          slug: 'little-gem-caesar',
          description: 'Little gem lettuce, anchovy dressing, sourdough crumbs, shaved pecorino',
          priceAmount: 14,
          imageAssetId: null,
          allergens: 'Gluten, Dairy, Fish',
          dietaryNotes: null,
          available: true,
          sortOrder: 1,
        },
        {
          id: 'mi-8',
          section: 'Pasta & Salads',
          name: 'Rigatoni Pomodoro',
          slug: 'rigatoni-pomodoro',
          description: 'Rigatoni, slow tomato sauce, basil, parmesan',
          priceAmount: 19,
          imageAssetId: null,
          allergens: 'Gluten, Dairy',
          dietaryNotes: 'Vegetarian',
          available: true,
          sortOrder: 2,
        },
        {
          id: 'mi-9',
          section: 'Drinks',
          name: 'Sparkling Lemonade',
          slug: 'sparkling-lemonade',
          description: 'House lemon cordial, soda, rosemary',
          priceAmount: 6,
          imageAssetId: null,
          allergens: null,
          dietaryNotes: 'Vegan, Gluten-free',
          available: true,
          sortOrder: 1,
        },
        {
          id: 'mi-10',
          section: 'Drinks',
          name: 'Italian Soda',
          slug: 'italian-soda',
          description: 'Blood orange, grapefruit, or limonata',
          priceAmount: 5,
          imageAssetId: null,
          allergens: null,
          dietaryNotes: 'Vegan, Gluten-free',
          available: true,
          sortOrder: 2,
        },
      ],
    },
    {
      id: 'menu-demo-2',
      locationId: 'loc-demo-2',
      name: 'Menu',
      description: 'Wood-fired pizza, fresh local antipasti, and craft drinks in the West Village.',
      sectionOrder: ['Wood-Fired Pizza', 'Antipasti', 'Drinks'],
      status: 'published',
      items: [
        {
          id: 'mi-demo2-1',
          section: 'Wood-Fired Pizza',
          name: 'Margherita',
          slug: 'margherita',
          description: 'San Marzano tomato, fior di latte, basil, extra virgin olive oil, sea salt',
          priceAmount: 18,
          imageAssetId: 'media-demo-margherita',
          allergens: 'Gluten, Dairy',
          dietaryNotes: 'Vegetarian',
          available: true,
          sortOrder: 1,
        },
        {
          id: 'mi-demo2-2',
          section: 'Wood-Fired Pizza',
          name: 'Pepperoni Calabrese',
          slug: 'pepperoni-calabrese',
          description: 'Tomato, mozzarella, cupping pepperoni, Calabrian chile, oregano',
          priceAmount: 21,
          imageAssetId: 'media-demo-pepperoni',
          allergens: 'Gluten, Dairy',
          dietaryNotes: null,
          available: true,
          sortOrder: 2,
        },
        {
          id: 'mi-demo2-3',
          section: 'Antipasti',
          name: 'Burrata',
          slug: 'burrata',
          description: 'Creamy burrata, roasted cherry tomatoes, basil oil, grilled sourdough',
          priceAmount: 16,
          imageAssetId: 'media-demo-burrata',
          allergens: 'Gluten, Dairy',
          dietaryNotes: 'Vegetarian',
          available: true,
          sortOrder: 1,
        },
        {
          id: 'mi-demo2-4',
          section: 'Drinks',
          name: 'Sparkling Lemonade',
          slug: 'sparkling-lemonade',
          description: 'House lemon cordial, soda, rosemary',
          priceAmount: 6,
          imageAssetId: null,
          allergens: null,
          dietaryNotes: 'Vegan, Gluten-free',
          available: true,
          sortOrder: 1,
        },
      ],
    },
  ],
  locationQa: [
    {
      id: 'qa-demo-1',
      locationId: 'loc-demo',
      question: 'Do you take reservations?',
      questionAuthor: 'A Guest',
      answer: 'Yes. We hold room for walk-ins, but reservations are recommended for dinner and weekends.',
      answerAuthor: 'Ember & Slice Brooklyn',
      isOwnerAnswer: true,
      upvoteCount: 14,
      source: 'manual',
      status: 'published',
      sortOrder: 1,
    },
    {
      id: 'qa-demo-2',
      locationId: 'loc-demo',
      question: 'Do you offer gluten-free crust?',
      questionAuthor: 'Another Guest',
      answer: 'Not yet. Our dough room uses wheat flour all day, so we cannot safely guarantee a gluten-free crust.',
      answerAuthor: 'Ember & Slice Brooklyn',
      isOwnerAnswer: true,
      upvoteCount: 8,
      source: 'manual',
      status: 'published',
      sortOrder: 2,
    },
    {
      id: 'qa-demo-3',
      locationId: 'loc-demo',
      question: 'Can I order takeout?',
      questionAuthor: 'A Guest',
      answer: 'Yes. Call us directly for pickup. Wood-fired pies travel best when picked up close to oven time.',
      answerAuthor: 'Ember & Slice Brooklyn',
      isOwnerAnswer: true,
      upvoteCount: 11,
      source: 'manual',
      status: 'published',
      sortOrder: 3,
    },
    {
      id: 'qa-demo-4',
      locationId: 'loc-demo',
      question: 'What are your busiest times?',
      questionAuthor: 'A Guest',
      answer: 'Friday and Saturday from 7pm to 9pm are peak. Earlier dinner or Sunday lunch is calmer.',
      answerAuthor: 'Ember & Slice Brooklyn',
      isOwnerAnswer: true,
      upvoteCount: 6,
      source: 'manual',
      status: 'published',
      sortOrder: 4,
    },
    {
      id: 'qa-demo-5',
      locationId: 'loc-demo',
      question: 'Do you have vegetarian options?',
      questionAuthor: 'A Guest',
      answer: 'Absolutely. Margherita, Funghi Bianco, Burrata, Garlic Knots, and Rigatoni Pomodoro are vegetarian.',
      answerAuthor: 'Ember & Slice Brooklyn',
      isOwnerAnswer: true,
      upvoteCount: 5,
      source: 'manual',
      status: 'published',
      sortOrder: 5,
    },
    {
      id: 'qa-demo2-1',
      locationId: 'loc-demo-2',
      question: 'Do you offer outdoor seating?',
      questionAuthor: 'Outdoor Diner',
      answer: 'Absolutely! We have a lovely patio setup for the warmer months.',
      answerAuthor: 'Ember & Slice West Village',
      isOwnerAnswer: true,
      upvoteCount: 8,
      source: 'manual',
      status: 'published',
      sortOrder: 1,
    },
    {
      id: 'qa-demo2-2',
      locationId: 'loc-demo-2',
      question: 'Do you offer gluten-free crust?',
      questionAuthor: 'Coeliac Foodie',
      answer: 'Yes, we offer gluten-free crust for any of our wood-fired pizzas for an additional charge.',
      answerAuthor: 'Ember & Slice West Village',
      isOwnerAnswer: true,
      upvoteCount: 5,
      source: 'manual',
      status: 'published',
      sortOrder: 2,
    },
  ],
  posts: [
    {
      id: 'post-demo-1',
      locationId: 'loc-demo',
      postType: 'update',
      title: 'Weekend lunch now starts at 11',
      body: 'The oven is lighting up earlier on Saturdays and Sundays. Come by for lunch pies, garlic knots, and spritzes from 11am.',
      imageAssetId: 'media-demo-post1',
      status: 'published',
      publishedAt: '2026-05-01T12:00:00.000Z',
      createdBy: 'user-demo',
      channelJobs: [
        { id: 'pcj-demo-1', channel: 'site', status: 'published', publishedAt: '2026-05-01T12:00:00.000Z' },
      ],
    },
    {
      id: 'post-demo-2',
      locationId: 'loc-demo',
      postType: 'standard',
      title: null,
      body: 'Our Funghi Bianco is back with roasted mushrooms, ricotta crema, thyme, and a little pecorino snow at the pass.',
      imageAssetId: 'media-demo-post2',
      status: 'published',
      publishedAt: '2026-04-18T10:00:00.000Z',
      createdBy: 'user-demo',
      channelJobs: [
        { id: 'pcj-demo-2', channel: 'site', status: 'published', publishedAt: '2026-04-18T10:00:00.000Z' },
      ],
    },
    {
      id: 'post-demo-3',
      locationId: 'loc-demo',
      postType: 'offer',
      title: 'Margherita Monday',
      body: 'Every Monday in May: Margherita pies are $14 from open to close. Dine-in only, one per guest.',
      imageAssetId: 'media-demo-post3',
      status: 'published',
      publishedAt: '2026-04-10T09:00:00.000Z',
      createdBy: 'user-demo',
      channelJobs: [
        { id: 'pcj-demo-3', channel: 'site', status: 'published', publishedAt: '2026-04-10T09:00:00.000Z' },
      ],
    },
  ],
  siteContentTranslations: [
    {
      id: 'sct-demo-th-home-hero',
      locationId: null,
      locale: 'th',
      page: 'home',
      field: 'hero',
      content: null,
      heroTitle: 'ไฟฟืนและค่ำคืนในบรูคลิน',
      heroSubtitle: 'พิซซ่าแป้งซาวโดว์ขอบพองกรอบ แอนติพาสติตามฤดูกาล และห้องอาหารที่อบอุ่นด้วยแสงจากเตา',
      value: 'ไฟฟืนและค่ำคืนในบรูคลิน',
      type: 'text',
      status: 'published',
      sourceHash: 'demo-pizza-home-hero-v1',
      translatedAt: '2026-05-01T00:00:00.000Z',
      reviewedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: 'sct-demo-th-cta',
      locationId: null,
      locale: 'th',
      page: 'home',
      field: 'cta.title',
      content: 'จองโต๊ะใกล้เตาอบ',
      heroTitle: null,
      heroSubtitle: null,
      value: 'จองโต๊ะใกล้เตาอบ',
      type: 'text',
      status: 'published',
      sourceHash: 'demo-pizza-cta-v1',
      translatedAt: '2026-05-01T00:00:00.000Z',
      reviewedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: 'sct-demo-th-story-title',
      locationId: null,
      locale: 'th',
      page: 'about',
      field: 'story.title',
      content: 'แทรตโทเรียที่มีเตาอบเป็นหัวใจ',
      heroTitle: null,
      heroSubtitle: null,
      value: 'แทรตโทเรียที่มีเตาอบเป็นหัวใจ',
      type: 'text',
      status: 'published',
      sourceHash: 'demo-pizza-story-title-v1',
      translatedAt: '2026-05-01T00:00:00.000Z',
      reviewedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: 'sct-demo-th-story-body',
      locationId: null,
      locale: 'th',
      page: 'about',
      field: 'story.body',
      content: 'Ember & Slice เริ่มจากแป้งซาวโดว์ เครื่องผสมที่ยืมมา และเตาอบป๊อปอัพหลังบาร์ไวน์แห่งหนึ่งในบรูคลิน พิซซ่าขายหมดก่อนพระอาทิตย์ตก แล้วก็ขายหมดอีกในสุดสัปดาห์ถัดมา และทุกสุดสัปดาห์หลังจากนั้น\n\nวันนี้ร้านมีที่อยู่ถาวรแล้ว แต่คำสัญญายังเหมือนเดิม: แป้งที่ใช้เวลา ไฟจริง วัตถุดิบตามฤดูกาล และการบริการที่ทำให้คืนธรรมดารู้สึกพิเศษ',
      heroTitle: null,
      heroSubtitle: null,
      value: 'Ember & Slice เริ่มจากแป้งซาวโดว์ เครื่องผสมที่ยืมมา และเตาอบป๊อปอัพหลังบาร์ไวน์แห่งหนึ่งในบรูคลิน',
      type: 'richtext',
      status: 'published',
      sourceHash: 'demo-pizza-story-body-v1',
      translatedAt: '2026-05-01T00:00:00.000Z',
      reviewedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
  businessLocationTranslations: [
    {
      id: 'blt-demo-th-loc',
      locationId: 'loc-demo',
      locale: 'th',
      title: 'Ember & Slice บรูคลิน',
      address: '184 Wythe Ave',
      city: 'บรูคลิน',
      description: 'แทรตโทเรียพิซซ่าเตาฟืนในบรูคลิน เสิร์ฟพิซซ่าแป้งซาวโดว์ แอนติพาสติตามฤดูกาล และบรรยากาศอบอุ่นรอบเตาอบ',
      shortDescription: 'พิซซ่าเตาฟืน แอนติพาสติตามฤดูกาล และการต้อนรับแบบเพื่อนบ้านในบรูคลิน',
      status: 'published',
      sourceHash: 'demo-pizza-location-v1',
      translatedAt: '2026-05-01T00:00:00.000Z',
      reviewedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
  menuTranslations: [
    {
      id: 'mt-demo-th-menu',
      menuId: 'menu-demo',
      locale: 'th',
      name: 'เมนู',
      description: 'พิซซ่าเตาฟืน แอนติพาสตี สลัด และเครื่องดื่มจาก Ember & Slice',
      sectionOrder: ['พิซซ่าเตาฟืน', 'แอนติพาสตี', 'พาสต้าและสลัด', 'เครื่องดื่ม'],
      status: 'published',
      sourceHash: 'demo-pizza-menu-v1',
      translatedAt: '2026-05-01T00:00:00.000Z',
      reviewedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
  menuItemTranslations: [
    {
      id: 'mit-demo-th-mi-1',
      menuItemId: 'mi-1',
      locale: 'th',
      section: 'พิซซ่าเตาฟืน',
      name: 'มาร์เกริตา',
      description: 'มะเขือเทศซานมาร์ซาโน ฟิออร์ดิลาเต้ ใบโหระพา น้ำมันมะกอกเอ็กซ์ตร้าเวอร์จิน และเกลือทะเล',
      allergens: 'กลูเตน, นม',
      dietaryNotes: 'มังสวิรัติ',
      status: 'published',
      sourceHash: 'demo-pizza-mi-1-v1',
      translatedAt: '2026-05-01T00:00:00.000Z',
      reviewedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: 'mit-demo-th-mi-2',
      menuItemId: 'mi-2',
      locale: 'th',
      section: 'พิซซ่าเตาฟืน',
      name: 'เปปเปอโรนีคาลาเบรเซ',
      description: 'ซอสมะเขือเทศ มอซซาเรลลา เปปเปอโรนี พริกคาลาเบรีย และออริกาโน',
      allergens: 'กลูเตน, นม',
      dietaryNotes: null,
      status: 'published',
      sourceHash: 'demo-pizza-mi-2-v1',
      translatedAt: '2026-05-01T00:00:00.000Z',
      reviewedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: 'mit-demo-th-mi-3',
      menuItemId: 'mi-3',
      locale: 'th',
      section: 'พิซซ่าเตาฟืน',
      name: 'ฟุงกีบิอังโก',
      description: 'เห็ดย่าง ครีมริคอตตา กระเทียม ไทม์ มอซซาเรลลา และเปโคริโน',
      allergens: 'กลูเตน, นม',
      dietaryNotes: 'มังสวิรัติ',
      status: 'published',
      sourceHash: 'demo-pizza-mi-3-v1',
      translatedAt: '2026-05-01T00:00:00.000Z',
      reviewedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: 'mit-demo-th-mi-5',
      menuItemId: 'mi-5',
      locale: 'th',
      section: 'แอนติพาสตี',
      name: 'บูราตา',
      description: 'บูราตาครีมมี่ มะเขือเทศเชอร์รีย่าง น้ำมันโหระพา และซาวโดว์ย่าง',
      allergens: 'กลูเตน, นม',
      dietaryNotes: 'มังสวิรัติ',
      status: 'published',
      sourceHash: 'demo-pizza-mi-5-v1',
      translatedAt: '2026-05-01T00:00:00.000Z',
      reviewedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: 'mit-demo-th-mi-6',
      menuItemId: 'mi-6',
      locale: 'th',
      section: 'แอนติพาสตี',
      name: 'การ์ลิกนอตส์',
      description: 'ขนมปังนอตส์อบเตาฟืน คลุกพาร์สลีย์ เนยกระเทียมย่าง และมารินารา',
      allergens: 'กลูเตน, นม',
      dietaryNotes: 'มังสวิรัติ',
      status: 'published',
      sourceHash: 'demo-pizza-mi-6-v1',
      translatedAt: '2026-05-01T00:00:00.000Z',
      reviewedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
  aiCredits: {
    balance: 500,
    lifetimeUsed: 127,
  },
  organizationBilling: {
    status: 'free',
    plan: 'free',
  },
  publicRoutes: [
    { path: '/experiences', title: /Experiences \| Ember & Slice/, text: 'Pizza Making Class' },
    { path: '/experiences/pizza-making-class', title: /Pizza Making Class Brooklyn \| Ember & Slice/, text: 'Stretch dough' },
    { path: '/experiences/natural-wine-and-pizza-night', title: /Natural Wine & Pizza Night Brooklyn \| Ember & Slice/, text: 'Small pours' },
    { path: '/experiences/family-pizza-night', title: /Family Pizza Night Brooklyn \| Ember & Slice/, text: 'Big-table dinner' },
  ],
}

export const compiledDemoSeed = compileCuratedSiteFixture(demoFixture)

export function renderCompiledDemoCoreSeedBlock(): string {
  const siteConfigRows = compiledDemoSeed.siteConfig
    .map((entry) => `  (${[
      sqlValue(compiledDemoSeed.identity.organizationId),
      sqlValue(compiledDemoSeed.identity.siteId),
      sqlValue(entry.key),
      sqlValue(entry.value),
    ].join(', ')})`)
    .join(',\n')

  const siteLocaleRows = compiledDemoSeed.siteLocales
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(compiledDemoSeed.identity.organizationId),
      sqlValue(compiledDemoSeed.identity.siteId),
      sqlValue(entry.locale),
      sqlValue(entry.label),
      sqlValue(entry.isSource),
      sqlValue(entry.status),
      sqlValue(entry.fallbackEnabled),
    ].join(', ')})`)
    .join(',\n')

  const siteDomainRows = compiledDemoSeed.siteDomains
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(compiledDemoSeed.identity.organizationId),
      sqlValue(compiledDemoSeed.identity.siteId),
      sqlValue(entry.domain),
      sqlValue(entry.type),
      sqlValue(entry.role),
      sqlValue(entry.status),
      sqlValue(entry.dnsStatus),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: demo_core
-- Canonical demo site core generated from the curated fixture contract.
INSERT OR REPLACE INTO sites (
  id, organization_id, theme_id, theme, slug, subdomain,
  brand_name, brand_description,
  status, plan, onboarding_status, url_structure, primary_location_id,
  contact_email, default_currency, vertical, content_source, media_source,
  og_image_asset_id
) VALUES (
  ${sqlValue(compiledDemoSeed.identity.siteId)},
  ${sqlValue(compiledDemoSeed.identity.organizationId)},
  ${sqlValue(compiledDemoSeed.site.themeId)},
  ${sqlValue(compiledDemoSeed.site.theme)},
  ${sqlValue(compiledDemoSeed.site.slug)},
  ${sqlValue(compiledDemoSeed.site.subdomain)},
  ${sqlValue(compiledDemoSeed.site.brandName)},
  ${sqlValue(compiledDemoSeed.site.brandDescription)},
  ${sqlValue(compiledDemoSeed.site.status)},
  ${sqlValue(compiledDemoSeed.site.plan)},
  ${sqlValue(compiledDemoSeed.site.onboardingStatus)},
  ${sqlValue(compiledDemoSeed.site.urlStructure)},
  NULL,
  ${sqlValue(compiledDemoSeed.site.contactEmail)},
  ${sqlValue(compiledDemoSeed.site.defaultCurrency)},
  ${sqlValue(compiledDemoSeed.site.vertical)},
  ${sqlValue(compiledDemoSeed.site.contentSource)},
  ${sqlValue(compiledDemoSeed.site.mediaSource)},
  NULL
);

INSERT OR REPLACE INTO site_config (organization_id, site_id, key, value)
VALUES
${siteConfigRows};

INSERT OR REPLACE INTO site_locales
  (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled)
VALUES
${siteLocaleRows};

INSERT OR REPLACE INTO site_domains (id, organization_id, site_id, domain, type, role, status, dns_status)
VALUES
${siteDomainRows};
-- END GENERATED: demo_core`
}

export function renderCompiledDemoMediaBlock(): string {
  const mediaRows = compiledDemoSeed.mediaAssets
    .map((media) => `  (${[
      sqlValue(media.id),
      sqlValue(media.organizationId),
      sqlValue(media.siteId),
      sqlValue(media.locationId),
      sqlValue(media.kind),
      sqlValue(media.provider),
      sqlValue(media.source),
      sqlValue(media.cloudflareImageId),
      sqlValue(media.r2Key),
      sqlValue(media.publicUrl),
      sqlValue(media.thumbnailUrl),
      sqlValue(media.mimeType),
      sqlValue(media.fileName),
      sqlValue(media.altText),
      sqlValue(media.category),
      sqlValue(media.status),
    ].join(', ')})`)
    .join(',\n')

  const locationRowsNoHero = compiledDemoSeed.locations
    .map((location) => `  (${[
      sqlValue(location.id),
      sqlValue(compiledDemoSeed.identity.organizationId),
      sqlValue(compiledDemoSeed.identity.siteId),
      sqlValue(location.slug),
      sqlValue(location.title),
      sqlValue(location.city),
      sqlJson(location.address),
      sqlValue(location.phone),
      sqlValue(location.email),
      sqlValue(location.mapsUrl),
      sqlValue(location.latitude),
      sqlValue(location.longitude),
      sqlValue(location.description),
      sqlValue(location.shortDescription),
      sqlJson(location.openingHours),
      sqlValue(location.rating),
      sqlValue(location.reviewCount),
      sqlValue(location.priceLevel),
      sqlJson(location.categories),
      sqlValue(location.instagramUrl),
      sqlValue(location.facebookUrl),
      sqlValue(location.isPrimary),
      sqlValue(location.status),
      'NULL',
      'NULL',
      sqlValue('Asia/Bangkok'),
    ].join(', ')})`)
    .join(',\n')

  const heroUpdates = compiledDemoSeed.locations
    .filter((l) => l.heroImageAssetId || l.heroVideoAssetId)
    .map((l) => `UPDATE business_locations SET hero_image_asset_id = ${sqlValue(l.heroImageAssetId ?? null)}, hero_video_asset_id = ${sqlValue(l.heroVideoAssetId ?? null)} WHERE id = ${sqlValue(l.id)};`)
    .join('\n')

  return `-- BEGIN GENERATED: demo_media
-- Insert locations first (without hero asset refs) to satisfy media_assets FK,
-- then insert media_assets, then patch hero refs back onto locations.
INSERT OR REPLACE INTO business_locations (
  id, organization_id, site_id, slug, title, city,
  address, phone, email, maps_url,
  latitude, longitude,
  description, short_description,
  opening_hours,
  rating, review_count,
  price_level, categories,
  instagram_url, facebook_url,
  is_primary, status,
  hero_image_asset_id, hero_video_asset_id,
  timezone
) VALUES
${locationRowsNoHero};

-- All media assets for the demo tenant.
INSERT OR REPLACE INTO media_assets
  (id, organization_id, site_id, location_id,
   kind, provider, source,
   cloudflare_image_id, r2_key, public_url, thumbnail_url,
   mime_type, file_name, alt_text, category, status)
VALUES
${mediaRows};

${heroUpdates}

UPDATE sites SET og_image_asset_id = 'media-demo-hero', primary_location_id = ${sqlValue(compiledDemoSeed.site.primaryLocationId)} WHERE id = ${sqlValue(compiledDemoSeed.identity.siteId)};
-- END GENERATED: demo_media`
}

export function renderCompiledDemoReviewsBlock(): string {
  const reviewRows = compiledDemoSeed.reviews
    .map((review) => `  (${[
      sqlValue(review.id),
      sqlValue(review.organizationId),
      sqlValue(review.siteId),
      sqlValue(review.locationId),
      sqlValue(review.authorName),
      sqlValue(review.reviewerPhotoUrl),
      sqlValue(review.rating),
      sqlValue(review.content),
      sqlValue(review.ownerReply),
      sqlValue(review.ownerReplyAt),
      sqlValue(review.status),
      sqlValue(review.source),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: demo_reviews
-- Reviews for the demo tenant.
INSERT OR IGNORE INTO reviews
  (id, organization_id, site_id, location_id,
   author_name, reviewer_photo_url, rating, content,
   owner_reply, owner_reply_at,
   status, source)
VALUES
${reviewRows};
-- END GENERATED: demo_reviews`
}

export function renderCompiledDemoMenuBlock(): string {
  const menuRows = compiledDemoSeed.menus
    .map((menu) => `  (${[
      sqlValue(menu.id),
      sqlValue(menu.organizationId),
      sqlValue(menu.siteId),
      sqlValue(menu.locationId),
      sqlValue(menu.name),
      sqlValue(menu.description),
      sqlJson(menu.sectionOrder),
      sqlValue(menu.status),
    ].join(', ')})`)
    .join(',\n')

  const allItems = compiledDemoSeed.menus.flatMap((menu) => menu.items)
  const menuItemRows = allItems
    .map((item) => `  (${[
      sqlValue(item.id),
      sqlValue(item.menuId),
      sqlValue(item.section),
      sqlValue(item.name),
      sqlValue(item.slug),
      sqlValue(item.description),
      sqlValue(item.priceAmount),
      sqlValue(item.imageAssetId),
      sqlValue(item.allergens),
      sqlValue(item.dietaryNotes),
      sqlValue(item.available),
      sqlValue(item.sortOrder),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: demo_menu
-- Menus and menu items for the demo tenant.
INSERT OR REPLACE INTO menus (id, organization_id, site_id, location_id, name, description, section_order, status)
VALUES
${menuRows};

INSERT OR IGNORE INTO menu_items
  (id, menu_id, section, name, slug, description, price_amount,
   image_asset_id, allergens, dietary_notes, available, sort_order)
VALUES
${menuItemRows};
-- END GENERATED: demo_menu`
}

export function renderCompiledDemoQaBlock(): string {
  const qaRows = compiledDemoSeed.locationQa
    .map((qa) => `  (${[
      sqlValue(qa.id),
      sqlValue(qa.organizationId),
      sqlValue(qa.siteId),
      sqlValue(qa.locationId),
      sqlValue(qa.question),
      sqlValue(qa.questionAuthor),
      sqlValue(qa.answer),
      sqlValue(qa.answerAuthor),
      sqlValue(qa.isOwnerAnswer),
      sqlValue(qa.upvoteCount),
      sqlValue(qa.source),
      sqlValue(qa.status),
      sqlValue(qa.sortOrder),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: demo_qa
-- Location Q&A for the demo tenant.
INSERT OR IGNORE INTO location_qa
  (id, organization_id, site_id, location_id,
   question, question_author, answer, answer_author,
   is_owner_answer, upvote_count, source, status, sort_order)
VALUES
${qaRows};
-- END GENERATED: demo_qa`
}

export function renderCompiledDemoPostsBlock(): string {
  const postRows = compiledDemoSeed.posts
    .map((post) => `  (${[
      sqlValue(post.id),
      sqlValue(post.organizationId),
      sqlValue(post.siteId),
      sqlValue(post.locationId),
      sqlValue(post.postType),
      sqlValue(post.title),
      sqlValue(post.body),
      sqlValue(post.imageAssetId),
      sqlValue(post.status),
      sqlValue(post.publishedAt),
      sqlValue(post.createdBy),
    ].join(', ')})`)
    .join(',\n')

  const allChannelJobs = compiledDemoSeed.posts.flatMap((post) => post.channelJobs)
  const channelJobRows = allChannelJobs
    .map((job) => `  (${[
      sqlValue(job.id),
      sqlValue(job.postId),
      sqlValue(job.organizationId),
      sqlValue(job.channel),
      sqlValue(job.status),
      sqlValue(job.publishedAt),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: demo_posts
-- Posts and channel jobs for the demo tenant.
INSERT OR IGNORE INTO posts
  (id, organization_id, site_id, location_id,
   post_type, title, body, image_asset_id,
   status, published_at, created_by)
VALUES
${postRows};

INSERT OR IGNORE INTO post_channel_jobs (id, post_id, organization_id, channel, status, published_at)
VALUES
${channelJobRows};
-- END GENERATED: demo_posts`
}

export function renderCompiledDemoExperienceSeedBlock(): string {
  const experienceRows = compiledDemoSeed.experiences
    .map((experience) => `  (${[
      sqlValue(experience.id),
      sqlValue(experience.organizationId),
      sqlValue(experience.siteId),
      sqlValue(experience.locationId),
      sqlValue(experience.title),
      sqlValue(experience.slug),
      sqlValue(experience.tagline),
      sqlValue(experience.body),
      sqlValue(experience.imageAssetId),
      sqlValue(experience.price),
      sqlValue(experience.priceAmount),
      sqlValue(experience.durationMinutes),
      sqlValue(experience.maxCapacity),
      sqlJson(experience.timeSlots),
      'NULL',
      sqlValue(experience.availableNote),
      sqlValue(experience.status),
      sqlValue(experience.sortOrder),
      sqlValue(experience.featured),
      sqlValue(experience.featuredSortOrder),
      sqlValue(experience.seoTitle),
      sqlValue(experience.seoDescription),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: demo_experiences
-- Hybrid restaurant + experiences showcase for the platform demo.
INSERT OR REPLACE INTO experiences
  (id, organization_id, site_id, location_id,
   title, slug, tagline, body,
   image_asset_id, price, price_amount, duration_minutes, max_capacity,
   time_slots, recurring_slots, available_note,
   status, sort_order, featured, featured_sort_order,
   seo_title, seo_description)
VALUES
${experienceRows};
-- END GENERATED: demo_experiences`
}

export function renderCompiledDemoContentBlock(): string {
  const contentRows = compiledDemoSeed.siteContent
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(entry.organizationId),
      sqlValue(entry.siteId),
      sqlValue(entry.locationId),
      sqlValue(entry.page),
      sqlValue(entry.field),
      sqlValue(entry.content),
      sqlValue(entry.heroTitle),
      sqlValue(entry.heroSubtitle),
      sqlValue(entry.heroImageAssetId),
      sqlValue(entry.heroVideoAssetId),
      sqlValue(entry.type),
      sqlValue(entry.source),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: demo_content
-- Site content for the demo tenant.
INSERT OR IGNORE INTO site_content
  (id, organization_id, site_id, location_id,
   page, field, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id,
   type, source)
VALUES
${contentRows};
-- END GENERATED: demo_content`
}

export function renderCompiledDemoTranslationsBlock(): string {
  const siteContentTranslationRows = compiledDemoSeed.siteContentTranslations
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(entry.organizationId),
      sqlValue(entry.siteId),
      sqlValue(entry.locationId),
      sqlValue(entry.locale),
      sqlValue(entry.page),
      sqlValue(entry.field),
      sqlValue(entry.content),
      sqlValue(entry.heroTitle),
      sqlValue(entry.heroSubtitle),
      sqlValue(entry.value),
      sqlValue(entry.type),
      sqlValue(entry.status),
      sqlValue(entry.sourceHash),
      sqlValue(entry.translatedAt),
      sqlValue(entry.reviewedAt),
    ].join(', ')})`)
    .join(',\n')

  const businessLocationTranslationRows = compiledDemoSeed.businessLocationTranslations
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(entry.organizationId),
      sqlValue(entry.siteId),
      sqlValue(entry.locationId),
      sqlValue(entry.locale),
      sqlValue(entry.title),
      sqlValue(entry.address),
      sqlValue(entry.city),
      sqlValue(entry.description),
      sqlValue(entry.shortDescription),
      sqlValue(entry.status),
      sqlValue(entry.sourceHash),
      sqlValue(entry.translatedAt),
      sqlValue(entry.reviewedAt),
    ].join(', ')})`)
    .join(',\n')

  const menuTranslationRows = compiledDemoSeed.menuTranslations
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(entry.organizationId),
      sqlValue(entry.siteId),
      sqlValue(entry.menuId),
      sqlValue(entry.locale),
      sqlValue(entry.name),
      sqlValue(entry.description),
      sqlJson(entry.sectionOrder),
      sqlValue(entry.status),
      sqlValue(entry.sourceHash),
      sqlValue(entry.translatedAt),
      sqlValue(entry.reviewedAt),
    ].join(', ')})`)
    .join(',\n')

  const menuItemTranslationRows = compiledDemoSeed.menuItemTranslations
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(entry.organizationId),
      sqlValue(entry.siteId),
      sqlValue(entry.menuItemId),
      sqlValue(entry.locale),
      sqlValue(entry.section),
      sqlValue(entry.name),
      sqlValue(entry.description),
      sqlValue(entry.allergens),
      sqlValue(entry.dietaryNotes),
      sqlValue(entry.status),
      sqlValue(entry.sourceHash),
      sqlValue(entry.translatedAt),
      sqlValue(entry.reviewedAt),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: demo_translations
INSERT OR IGNORE INTO site_content_translations
  (id, organization_id, site_id, location_id, locale, page, field, content, hero_title, hero_subtitle, value, type, status, source_hash, translated_at, reviewed_at)
VALUES
${siteContentTranslationRows};

INSERT OR IGNORE INTO business_location_translations
  (id, organization_id, site_id, location_id, locale, title, address, city, description, short_description, status, source_hash, translated_at, reviewed_at)
VALUES
${businessLocationTranslationRows};

INSERT OR IGNORE INTO menu_translations
  (id, organization_id, site_id, menu_id, locale, name, description, section_order, status, source_hash, translated_at, reviewed_at)
VALUES
${menuTranslationRows};

INSERT OR IGNORE INTO menu_item_translations
  (id, organization_id, site_id, menu_item_id, locale, section, name, description, allergens, dietary_notes, status, source_hash, translated_at, reviewed_at)
VALUES
${menuItemTranslationRows};
-- END GENERATED: demo_translations`
}

export function renderCompiledDemoBillingBlock(): string {
  const { identity, aiCredits, organizationBilling } = compiledDemoSeed
  const parts: string[] = []

  if (aiCredits) {
    parts.push(`INSERT OR REPLACE INTO ai_credits (organization_id, balance, lifetime_used)
VALUES (${sqlValue(identity.organizationId)}, ${aiCredits.balance}, ${aiCredits.lifetimeUsed});`)
  }

  if (organizationBilling) {
    parts.push(renderSiteBillingSql(identity.siteId, identity.organizationId, organizationBilling, sqlValue))
    parts.push(renderSiteEntitlementsSql(identity.siteId, identity.organizationId, organizationBilling.plan, sqlValue))
  }

  return `-- BEGIN GENERATED: demo_billing
${parts.join('\n\n')}
-- END GENERATED: demo_billing`
}

export const renderDemoExperienceSeedBlock = renderCompiledDemoExperienceSeedBlock
