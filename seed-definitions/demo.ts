export interface DemoSeedExperienceMedia {
  id: string
  location_id: string
  public_url: string
  thumbnail_url: string | null
  mime_type: string
  file_name: string
  alt_text: string
  category: 'food' | 'interior' | 'exterior' | 'team' | 'other'
}

export interface DemoSeedExperience {
  id: string
  location_id: string
  title: string
  slug: string
  tagline: string
  body: string
  image_asset_id: string
  price: string
  duration_minutes: number
  max_capacity: number
  time_slots: string[]
  available_note: string
  status: 'active' | 'inactive' | 'sold_out'
  sort_order: number
  featured: boolean
  featured_sort_order: number
  seo_title: string
  seo_description: string
}

export interface DemoPublicRouteExpectation {
  path: string
  title: RegExp
  text: string
}

interface DemoFixtureDefinition {
  orgId: string
  siteId: string
  experiencesPage: {
    kicker: string
    title: string
    subtitle: string
  }
  experienceMedia: DemoSeedExperienceMedia[]
  experiences: DemoSeedExperience[]
  publicRoutes: DemoPublicRouteExpectation[]
}

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

export const demoFixture: DemoFixtureDefinition = {
  orgId: 'org-demo',
  siteId: 'site-demo',
  experiencesPage: {
    kicker: 'Experiences',
    title: 'Pizza classes, tasting nights, and big-table evenings.',
    subtitle:
      'Book a hands-on pizza class, a natural wine pairing night, or a family-style evening built around the oven.',
  },
  experienceMedia: [
    {
      id: 'media-demo-exp-class',
      location_id: 'loc-demo',
      public_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&q=80',
      thumbnail_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=70',
      mime_type: 'image/jpeg',
      file_name: 'pizza-making-class.jpg',
      alt_text: 'Guests shaping pizza dough at a hands-on pizza making class',
      category: 'food',
    },
    {
      id: 'media-demo-exp-wine',
      location_id: 'loc-demo',
      public_url: 'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?w=1200&q=80',
      thumbnail_url: 'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?w=600&q=70',
      mime_type: 'image/jpeg',
      file_name: 'natural-wine-pizza-night.jpg',
      alt_text: 'Pizza and wine set for a long-table dinner evening',
      category: 'interior',
    },
    {
      id: 'media-demo-exp-family',
      location_id: 'loc-demo',
      public_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80',
      thumbnail_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=70',
      mime_type: 'image/jpeg',
      file_name: 'family-pizza-night.jpg',
      alt_text: 'Family-style dinner table set for pizza night',
      category: 'interior',
    },
  ],
  experiences: [
    {
      id: 'exp-demo-pizza-class',
      location_id: 'loc-demo',
      title: 'Pizza Making Class',
      slug: 'pizza-making-class',
      tagline: 'Stretch dough, top your pie, and fire it yourself.',
      body:
        'Our flagship pizza making class brings guests right up to the bench and oven. You will learn how we stretch our dough, build a balanced pie, and work with high-heat live fire without feeling rushed.\n\nEach booking includes dough, toppings, one personal pizza, and a glass of house wine or sparkling lemonade. Great for couples, visitors, and anyone who wants a hands-on dinner plan in Brooklyn.',
      image_asset_id: 'media-demo-exp-class',
      price: '$95 per guest',
      duration_minutes: 120,
      max_capacity: 10,
      time_slots: ['14:00', '18:00'],
      available_note: 'Thursday to Sunday. Advance booking recommended.',
      status: 'active',
      sort_order: 1,
      featured: true,
      featured_sort_order: 1,
      seo_title: 'Pizza Making Class Brooklyn | Ember & Slice',
      seo_description:
        'Book a hands-on pizza making class at Ember & Slice in Brooklyn. Stretch dough, build your pie, and fire it in our oven.',
    },
    {
      id: 'exp-demo-wine-night',
      location_id: 'loc-demo',
      title: 'Natural Wine & Pizza Night',
      slug: 'natural-wine-and-pizza-night',
      tagline: 'Small pours, hot pies, and long-table energy.',
      body:
        'This evening is part tasting, part dinner party. We pair a rotating lineup of natural wines with off-menu pies, seasonal antipasti, and a little background on why each pairing works.\n\nBest for date nights, visiting friends, and anyone who wants the room at its loudest and warmest. Seats are shared at the table, and the menu changes with the week.',
      image_asset_id: 'media-demo-exp-wine',
      price: '$78 per guest',
      duration_minutes: 150,
      max_capacity: 16,
      time_slots: ['19:30'],
      available_note: 'Fridays only. Shared table seating.',
      status: 'active',
      sort_order: 2,
      featured: true,
      featured_sort_order: 2,
      seo_title: 'Natural Wine & Pizza Night Brooklyn | Ember & Slice',
      seo_description:
        'Reserve Natural Wine & Pizza Night at Ember & Slice in Brooklyn for curated pours, seasonal pies, and a long-table dinner.',
    },
    {
      id: 'exp-demo-family-night',
      location_id: 'loc-demo',
      title: 'Family Pizza Night',
      slug: 'family-pizza-night',
      tagline: 'Big-table dinner, easy pacing, and pizza for all ages.',
      body:
        'Family Pizza Night is our easiest way to turn a Sunday dinner into something a little more memorable. Kids shape mini pies, grown-ups share large-format pizzas and salads, and the kitchen keeps the pacing relaxed.\n\nIdeal for families, birthday dinners, and mixed-age groups who want an experience that feels special without feeling formal.',
      image_asset_id: 'media-demo-exp-family',
      price: '$140 per table',
      duration_minutes: 105,
      max_capacity: 6,
      time_slots: ['17:00', '18:30'],
      available_note: 'Sundays only. Best for groups of 4 to 6.',
      status: 'active',
      sort_order: 3,
      featured: true,
      featured_sort_order: 3,
      seo_title: 'Family Pizza Night Brooklyn | Ember & Slice',
      seo_description:
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

export function renderDemoExperienceSeedBlock(): string {
  const mediaRows = demoFixture.experienceMedia
    .map((media) => `  (${[
      sqlValue(media.id),
      sqlValue(demoFixture.orgId),
      sqlValue(demoFixture.siteId),
      sqlValue(media.location_id),
      sqlValue('image'),
      sqlValue('external_url'),
      sqlValue('external'),
      sqlValue(media.public_url),
      sqlValue(media.thumbnail_url),
      sqlValue(media.mime_type),
      sqlValue(media.file_name),
      sqlValue(media.alt_text),
      sqlValue(media.category),
      sqlValue('active'),
    ].join(', ')})`)
    .join(',\n')

  const experienceRows = demoFixture.experiences
    .map((experience) => `  (${[
      sqlValue(experience.id),
      sqlValue(demoFixture.orgId),
      sqlValue(demoFixture.siteId),
      sqlValue(experience.location_id),
      sqlValue(experience.title),
      sqlValue(experience.slug),
      sqlValue(experience.tagline),
      sqlValue(experience.body),
      sqlValue(experience.image_asset_id),
      sqlValue(experience.price),
      sqlValue(experience.duration_minutes),
      sqlValue(experience.max_capacity),
      sqlJson(experience.time_slots),
      sqlValue(experience.available_note),
      sqlValue(experience.status),
      sqlValue(experience.sort_order),
      sqlValue(experience.featured),
      sqlValue(experience.featured_sort_order),
      sqlValue(experience.seo_title),
      sqlValue(experience.seo_description),
    ].join(', ')})`)
    .join(',\n')

  const contentSeedRows: Array<[string, string, string, string, string]> = [
    ['sc-demo-exp-kicker', 'experiences', 'hero.kicker', demoFixture.experiencesPage.kicker, 'text'],
    ['sc-demo-exp-title', 'experiences', 'hero.title', demoFixture.experiencesPage.title, 'text'],
    ['sc-demo-exp-subtitle', 'experiences', 'hero.subtitle', demoFixture.experiencesPage.subtitle, 'textarea'],
  ]

  const contentRows = contentSeedRows
    .map(([id, page, field, content, type]) => `  (${[
      sqlValue(id),
      sqlValue(demoFixture.orgId),
      sqlValue(demoFixture.siteId),
      'NULL',
      sqlValue(page),
      sqlValue(field),
      sqlValue(content),
      'NULL',
      'NULL',
      'NULL',
      sqlValue(type),
      sqlValue('manual'),
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
