import { compileCuratedSiteFixture } from './compile.ts'
import type { CuratedSiteDefinition } from './contracts.ts'

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
    },
  ],
  mediaAssets: [
    {
      id: 'media-demo-exp-class',
      locationId: 'loc-demo',
      publicUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=70',
      mimeType: 'image/jpeg',
      fileName: 'pizza-making-class.jpg',
      altText: 'Guests shaping pizza dough at a hands-on pizza making class',
      category: 'food',
    },
    {
      id: 'media-demo-exp-wine',
      locationId: 'loc-demo',
      publicUrl: 'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?w=1200&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?w=600&q=70',
      mimeType: 'image/jpeg',
      fileName: 'natural-wine-pizza-night.jpg',
      altText: 'Pizza and wine set for a long-table dinner evening',
      category: 'interior',
    },
    {
      id: 'media-demo-exp-family',
      locationId: 'loc-demo',
      publicUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=70',
      mimeType: 'image/jpeg',
      fileName: 'family-pizza-night.jpg',
      altText: 'Family-style dinner table set for pizza night',
      category: 'interior',
    },
  ],
  siteContent: [
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

  const locationRows = compiledDemoSeed.locations
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
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: demo_core
-- Canonical demo site core generated from the curated fixture contract.
INSERT INTO sites (
  id, organization_id, theme_id, theme, slug, subdomain,
  brand_name, brand_description,
  status, plan, onboarding_status, url_structure, primary_location_id,
  contact_email, default_currency, vertical, content_source, media_source
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
  ${sqlValue(compiledDemoSeed.site.mediaSource)}
);

INSERT INTO site_config (organization_id, site_id, key, value)
VALUES
${siteConfigRows};

INSERT INTO site_locales
  (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled)
VALUES
${siteLocaleRows};

INSERT INTO site_domains (id, organization_id, site_id, domain, type, role, status, dns_status)
VALUES
${siteDomainRows};

INSERT INTO business_locations (
  id, organization_id, site_id, slug, title, city,
  address, phone, email, maps_url,
  latitude, longitude,
  description, short_description,
  opening_hours,
  rating, review_count,
  price_level, categories,
  instagram_url, facebook_url,
  is_primary, status
) VALUES
${locationRows};

UPDATE sites SET primary_location_id = ${sqlValue(compiledDemoSeed.site.primaryLocationId)} WHERE id = ${sqlValue(compiledDemoSeed.identity.siteId)};
-- END GENERATED: demo_core`
}

export function renderCompiledDemoExperienceSeedBlock(): string {
  const mediaRows = compiledDemoSeed.mediaAssets
    .map((media) => `  (${[
      sqlValue(media.id),
      sqlValue(media.organizationId),
      sqlValue(media.siteId),
      sqlValue(media.locationId),
      sqlValue(media.kind),
      sqlValue(media.provider),
      sqlValue(media.source),
      sqlValue(media.publicUrl),
      sqlValue(media.thumbnailUrl),
      sqlValue(media.mimeType),
      sqlValue(media.fileName),
      sqlValue(media.altText),
      sqlValue(media.category),
      sqlValue(media.status),
    ].join(', ')})`)
    .join(',\n')

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
      sqlValue(experience.durationMinutes),
      sqlValue(experience.maxCapacity),
      sqlJson(experience.timeSlots),
      sqlValue(experience.availableNote),
      sqlValue(experience.status),
      sqlValue(experience.sortOrder),
      sqlValue(experience.featured),
      sqlValue(experience.featuredSortOrder),
      sqlValue(experience.seoTitle),
      sqlValue(experience.seoDescription),
    ].join(', ')})`)
    .join(',\n')

  const contentRows = compiledDemoSeed.siteContent
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(entry.organizationId),
      sqlValue(entry.siteId),
      sqlValue(entry.locationId),
      sqlValue(entry.page),
      sqlValue(entry.field),
      sqlValue(entry.content),
      'NULL',
      'NULL',
      'NULL',
      sqlValue(entry.type),
      sqlValue(entry.source),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: demo_experiences
-- Hybrid restaurant + experiences showcase for the platform demo.
INSERT INTO media_assets
  (id, organization_id, site_id, location_id,
   kind, provider, source,
   public_url, thumbnail_url,
   mime_type, file_name, alt_text, category, status)
VALUES
${mediaRows};

INSERT INTO experiences
  (id, organization_id, site_id, location_id,
   title, slug, tagline, body,
   image_asset_id, price, duration_minutes, max_capacity,
   time_slots, available_note,
   status, sort_order, featured, featured_sort_order,
   seo_title, seo_description)
VALUES
${experienceRows};

INSERT INTO site_content
  (id, organization_id, site_id, location_id,
   page, field, content, hero_title, hero_subtitle, hero_image_asset_id,
   type, source)
VALUES
${contentRows};
-- END GENERATED: demo_experiences`
}

export const renderDemoExperienceSeedBlock = renderCompiledDemoExperienceSeedBlock
