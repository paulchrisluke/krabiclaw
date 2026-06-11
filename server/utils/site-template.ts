// Seed a newly created site with template content so owners see a populated
// site on day one — ready to replace with real data.
// All records use source='template' so ChowBot can identify and reference them.

import type { SiteVertical } from '~/utils/vertical-copy'

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

const TEMPLATE_HERO_IMAGE = {
  cloudflareImageId: '0762ea49-0bd2-4cc8-1044-d6c9b1f00100',
  publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0762ea49-0bd2-4cc8-1044-d6c9b1f00100/public',
  thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0762ea49-0bd2-4cc8-1044-d6c9b1f00100/thumbnail',
}

const TEMPLATE_STORY_IMAGE = {
  cloudflareImageId: '03e7f501-7689-4607-3acb-ec6f0d958500',
  publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/03e7f501-7689-4607-3acb-ec6f0d958500/public',
  thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/03e7f501-7689-4607-3acb-ec6f0d958500/thumbnail',
}

// Per-vertical menu sections. Restaurant uses the familiar 4-section layout;
// other verticals that don't have a menu get no menu seeded.
const VERTICAL_MENU_SECTIONS: Partial<Record<SiteVertical, Array<[string, string, string, string, number]>>> = {
  restaurant: [
    ['Starter', 'Sample Starter', 'starter', 'A delicious way to begin. Update this with your actual starter.', 8],
    ['Starter', 'Soup of the Day', 'soup', 'Ask your server. Made fresh daily.', 7],
    ['Mains', 'House Special', 'house-special', 'Your signature dish goes here. Update with name, description, and price.', 18],
    ['Mains', 'Chef\'s Recommendation', 'chefs-rec', 'The dish your team is most proud of.', 20],
    ['Mains', 'Vegetarian Option', 'vegetarian', 'A plant-based option for every menu.', 15],
    ['Desserts', 'Dessert of the Day', 'dessert', 'Ask your server what is on today.', 7],
    ['Drinks', 'House Lemonade', 'lemonade', 'Made fresh each morning.', 4],
    ['Drinks', 'Soft Drink', 'soft-drink', 'Pepsi, Diet Pepsi, or lemonade.', 3],
  ],
}

// Per-vertical Q&A seeds
const VERTICAL_QA: Partial<Record<SiteVertical, Array<[string, string, number]>>> = {
  restaurant: [
    ['Do you take reservations?', 'Yes — you can book a table through our reservations page or call us directly.', 1],
    ['Do you have vegetarian or vegan options?', 'Yes, we have vegetarian options on the menu. Ask your server about vegan modifications.', 2],
    ['Is there parking nearby?', 'Yes — there is parking available nearby. See our contact page for directions.', 3],
  ],
  experience: [
    ['How do I book a class?', 'You can book a class or session directly from our experiences page.', 1],
    ['What should I bring?', 'Comfortable clothes and an open mind. We provide all the materials and tools needed.', 2],
    ['Is there parking nearby?', 'Yes — there is parking available nearby. See our contact page for directions.', 3],
  ],
  retail: [
    ['Do you ship?', 'Contact us through the form below and we can discuss delivery or pickup options.', 1],
    ['Are you open on public holidays?', 'Our hours may vary on public holidays — check our contact page for the most up-to-date hours.', 2],
    ['Is there parking nearby?', 'Yes — there is parking available nearby. See our contact page for directions.', 3],
  ],
  wellness: [
    ['How do I book a session?', 'You can book a session or appointment directly from our bookings page.', 1],
    ['What should I bring?', 'Comfortable clothes and a water bottle. We provide any specialist equipment needed.', 2],
    ['Is there parking nearby?', 'Yes — there is parking available nearby. See our contact page for directions.', 3],
  ],
  service: [
    ['How do I request a quote?', 'You can submit a request through our contact form or book an appointment directly.', 1],
    ['How long does a typical appointment take?', 'This depends on the service — we will confirm timing when you book.', 2],
    ['Is there parking nearby?', 'Yes — there is parking available nearby. See our contact page for directions.', 3],
  ],
}

// Per-vertical site_content seeds
const VERTICAL_SITE_CONTENT: Partial<Record<SiteVertical, (name: string, storyMediaId: string) => Array<[string, string, string, string?]>>> = {
  restaurant: (name, storyMediaId) => [
    ['home', 'cta.title', 'Come hungry.'],
    ['about', 'hero.title', 'About Us'],
    ['about', 'hero.subtitle', `${name} is built around generous food, warm service, and a room that feels easy to return to.`],
    ['about', 'story.image', storyMediaId, 'media'],
    ['about', 'story.title', 'Our Story'],
    ['about', 'story.body', `${name} started with a simple idea: make the food we love, serve it with care, and keep the welcome honest.\n\nToday, that same idea guides every part of the restaurant, from the first prep list of the morning to the last table of the night.`],
    ['about', 'journey.title', 'Our Journey'],
    ['about', 'journey.body', `${name} is a neighbourhood restaurant focused on doing a small number of things exceptionally well.\n\nAdd the milestones that shaped your restaurant: where you started, what changed along the way, and what guests can expect when they walk through the door.`],
    ['about', 'cta.title', 'Come dine with us'],
  ],
  experience: (name, storyMediaId) => [
    ['home', 'cta.title', 'Book a class.'],
    ['about', 'hero.title', 'About Us'],
    ['about', 'hero.subtitle', `${name} is built around hands-on learning, skilled instruction, and a space that invites you to try something new.`],
    ['about', 'story.image', storyMediaId, 'media'],
    ['about', 'story.title', 'Our Story'],
    ['about', 'story.body', `${name} started with a simple idea: share a skill, build a community, and make the process enjoyable from start to finish.\n\nToday, that same idea shapes every class, workshop, and session we offer.`],
    ['about', 'journey.title', 'Our Journey'],
    ['about', 'journey.body', `${name} is a hands-on studio focused on doing a small number of things exceptionally well.\n\nAdd the milestones that shaped your studio: where you started, what changed along the way, and what guests can expect when they arrive.`],
    ['about', 'cta.title', 'Book a class'],
  ],
  retail: (name, storyMediaId) => [
    ['home', 'cta.title', 'Come visit us.'],
    ['about', 'hero.title', 'About Us'],
    ['about', 'hero.subtitle', `${name} is built around carefully chosen products, knowledgeable staff, and a shop worth coming back to.`],
    ['about', 'story.image', storyMediaId, 'media'],
    ['about', 'story.title', 'Our Story'],
    ['about', 'story.body', `${name} started with a simple idea: carry things worth buying, in a space worth visiting.\n\nToday, that same principle guides everything from our product selection to how we run the shop floor.`],
    ['about', 'journey.title', 'Our Journey'],
    ['about', 'journey.body', `${name} is a retail shop focused on doing a small number of things exceptionally well.\n\nAdd the milestones that shaped your business: where you started, what changed along the way, and what customers can expect when they visit.`],
    ['about', 'cta.title', 'Visit us'],
  ],
  wellness: (name, storyMediaId) => [
    ['home', 'cta.title', 'Book a session.'],
    ['about', 'hero.title', 'About Us'],
    ['about', 'hero.subtitle', `${name} is built around restorative practice, qualified practitioners, and a space designed for your wellbeing.`],
    ['about', 'story.image', storyMediaId, 'media'],
    ['about', 'story.title', 'Our Story'],
    ['about', 'story.body', `${name} started with a simple idea: make expert wellness accessible, in an environment that puts you at ease.\n\nToday, that same intention shapes every session and service we offer.`],
    ['about', 'journey.title', 'Our Journey'],
    ['about', 'journey.body', `${name} is a wellness studio focused on doing a small number of things exceptionally well.\n\nAdd the milestones that shaped your practice: where you started, what changed along the way, and what clients can expect when they arrive.`],
    ['about', 'cta.title', 'Book a session'],
  ],
  service: (name, storyMediaId) => [
    ['home', 'cta.title', 'Book an appointment.'],
    ['about', 'hero.title', 'About Us'],
    ['about', 'hero.subtitle', `${name} is built around skilled work, honest pricing, and service you can trust.`],
    ['about', 'story.image', storyMediaId, 'media'],
    ['about', 'story.title', 'Our Story'],
    ['about', 'story.body', `${name} started with a simple idea: do good work, be straight with clients, and let the results speak for themselves.\n\nToday, that same approach guides every job we take on.`],
    ['about', 'journey.title', 'Our Journey'],
    ['about', 'journey.body', `${name} is a service business focused on doing a small number of things exceptionally well.\n\nAdd the milestones that shaped your business: where you started, what changed along the way, and what clients can expect when they work with you.`],
    ['about', 'cta.title', 'Book an appointment'],
  ],
}

export async function seedNewSite(
  db: D1Database,
  params: { organizationId: string; siteId: string; name: string; vertical: SiteVertical }
): Promise<void> {
  if (!db) throw new Error('Database not configured')

  const { organizationId, siteId, name, vertical } = params

  // Reuse existing location on resume (site may have failed mid-seed)
  const existing = await db.prepare(
    'SELECT id FROM business_locations WHERE site_id = ? AND slug = ? LIMIT 1'
  ).bind(siteId, 'main').first<{ id: string }>()
  const locationId = existing?.id ?? uid('loc')
  const heroMediaId = uid('media')
  const storyMediaId = uid('media')

  const statements: D1PreparedStatement[] = []

  // ── Location ──────────────────────────────────────────────────────────────
  statements.push(db.prepare(`
    INSERT OR IGNORE INTO business_locations
      (id, organization_id, site_id, slug, title, city, description, opening_hours,
       rating, review_count, is_primary, status)
    VALUES (?, ?, ?, 'main', ?, 'Your City',
      'Add your description here — what makes your place special and why guests keep coming back.',
      '[{"openDay":"MONDAY","openTime":"09:00","closeTime":"18:00"},{"openDay":"TUESDAY","openTime":"09:00","closeTime":"18:00"},{"openDay":"WEDNESDAY","openTime":"09:00","closeTime":"18:00"},{"openDay":"THURSDAY","openTime":"09:00","closeTime":"18:00"},{"openDay":"FRIDAY","openTime":"09:00","closeTime":"18:00"},{"openDay":"SATURDAY","openTime":"10:00","closeTime":"17:00"}]',
      0, 0, 1, 'active')
  `).bind(locationId, organizationId, siteId, name))

  // ── Hero image ────────────────────────────────────────────────────────────
  statements.push(db.prepare(`
    INSERT OR IGNORE INTO media_assets
      (id, organization_id, site_id, location_id, kind, provider, source,
       cloudflare_image_id, public_url, thumbnail_url, mime_type, file_name, alt_text, status)
    VALUES (?, ?, ?, ?, 'image', 'cloudflare_images', 'generated',
      ?, ?, ?, 'image/jpeg', 'hero.jpg', ?, 'active')
  `).bind(
    heroMediaId,
    organizationId,
    siteId,
    locationId,
    TEMPLATE_HERO_IMAGE.cloudflareImageId,
    TEMPLATE_HERO_IMAGE.publicUrl,
    TEMPLATE_HERO_IMAGE.thumbnailUrl,
    `${name} hero image`
  ))

  statements.push(db.prepare(`
    UPDATE business_locations
    SET hero_image_asset_id = ?
    WHERE id = ?
  `).bind(heroMediaId, locationId))

  // ── Story image ───────────────────────────────────────────────────────────
  statements.push(db.prepare(`
    INSERT OR IGNORE INTO media_assets
      (id, organization_id, site_id, location_id, kind, provider, source,
       cloudflare_image_id, public_url, thumbnail_url, mime_type, file_name, alt_text, status)
    VALUES (?, ?, ?, ?, 'image', 'cloudflare_images', 'generated',
      ?, ?, ?, 'image/jpeg', 'story.jpg', ?, 'active')
  `).bind(
    storyMediaId,
    organizationId,
    siteId,
    locationId,
    TEMPLATE_STORY_IMAGE.cloudflareImageId,
    TEMPLATE_STORY_IMAGE.publicUrl,
    TEMPLATE_STORY_IMAGE.thumbnailUrl,
    `${name} story image`
  ))

  // ── Sample menu (restaurant only) ─────────────────────────────────────────
  const menuItems = VERTICAL_MENU_SECTIONS[vertical]
  if (menuItems && menuItems.length > 0) {
    const menuId = uid('menu')
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO menus (id, organization_id, site_id, location_id, name, status)
      VALUES (?, ?, ?, ?, 'Menu', 'published')
    `).bind(menuId, organizationId, siteId, locationId))

    for (let i = 0; i < menuItems.length; i++) {
      const [section, itemName, slug, description, price] = menuItems[i]!
      statements.push(db.prepare(`
        INSERT OR IGNORE INTO menu_items
          (id, menu_id, section, name, slug, description, price_amount, available, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).bind(uid('mi'), menuId, section, itemName, slug, description, price, i))
    }
  }

  // ── Sample Q&A ────────────────────────────────────────────────────────────
  const qa = VERTICAL_QA[vertical] ?? VERTICAL_QA.restaurant!
  for (const [question, answer, order] of qa) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO location_qa
        (id, organization_id, site_id, location_id, question, answer, answer_author,
         is_owner_answer, source, status, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'template', 'published', ?)
    `).bind(uid('qa'), organizationId, siteId, locationId, question, answer, name, order))
  }

  // ── Sample post ───────────────────────────────────────────────────────────
  const postId = uid('post')
  const postBody = vertical === 'restaurant'
    ? 'We just launched our new site — you can now browse our full menu, check our hours, and book a table online. More updates coming soon.'
    : 'We just launched our new site — you can now browse what we offer, check our hours, and get in touch. More updates coming soon.'
  statements.push(db.prepare(`
    INSERT OR IGNORE INTO posts
      (id, organization_id, site_id, location_id, post_type, title, body,
       status, published_at, created_by)
    VALUES (?, ?, ?, ?, 'update', 'Welcome to our new website',
      ?,
      'published', datetime('now'), 'system')
  `).bind(postId, organizationId, siteId, locationId, postBody))

  statements.push(db.prepare(`
    INSERT OR IGNORE INTO post_channel_jobs (id, post_id, organization_id, channel, status, published_at)
    VALUES (?, ?, ?, 'site', 'published', datetime('now'))
  `).bind(uid('pcj'), postId, organizationId))

  // ── Homepage CTA + about page content (vertical-specific) ─────────────────
  const siteContentFn = VERTICAL_SITE_CONTENT[vertical] ?? VERTICAL_SITE_CONTENT.restaurant!
  const siteContent = siteContentFn(name, storyMediaId)

  for (const [page, field, content, type] of siteContent) {
    const contentType = type ?? 'text'
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO site_content
        (id, organization_id, site_id, location_id, page, field, content, type, source)
      VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'template')
    `).bind(uid('sc'), organizationId, siteId, page, field, content, contentType))
  }

  await db.batch(statements)
}
