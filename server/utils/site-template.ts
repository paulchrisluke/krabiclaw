// Seed a newly created site with template content so owners see a fully
// populated Saya site on day one — ready to replace with real data.
// All records use source='template' so ChowBot can identify and reference them.

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export async function seedNewSite(
  db: D1Database,
  params: { organizationId: string; siteId: string; restaurantName: string }
): Promise<void> {
  if (!db) throw new Error('Database not configured')

  const { organizationId, siteId, restaurantName } = params

  const locationId = uid('loc')
  const heroMediaId = uid('media')
  const storyMediaId = uid('media')
  const menuId = uid('menu')

  const statements: D1PreparedStatement[] = []

  // ── Location ──────────────────────────────────────────────────────────────
  statements.push(db.prepare(`
    INSERT OR IGNORE INTO business_locations
      (id, organization_id, site_id, slug, title, city, description, opening_hours,
       rating, review_count, is_primary, status)
    VALUES (?, ?, ?, 'main', ?, 'Your City',
      'Add your restaurant description here — what makes your place special, what you cook, and why guests keep coming back.',
      '[{"openDay":"MONDAY","openTime":"11:00","closeTime":"21:00"},{"openDay":"TUESDAY","openTime":"11:00","closeTime":"21:00"},{"openDay":"WEDNESDAY","openTime":"11:00","closeTime":"21:00"},{"openDay":"THURSDAY","openTime":"11:00","closeTime":"21:00"},{"openDay":"FRIDAY","openTime":"11:00","closeTime":"22:00"},{"openDay":"SATURDAY","openTime":"11:00","closeTime":"22:00"},{"openDay":"SUNDAY","openTime":"12:00","closeTime":"20:00"}]',
      0, 0, 1, 'active')
  `).bind(locationId, organizationId, siteId, restaurantName))

  // ── Hero image ────────────────────────────────────────────────────────────
  statements.push(db.prepare(`
    INSERT OR IGNORE INTO media_assets
      (id, organization_id, site_id, location_id, kind, provider, source,
       public_url, thumbnail_url, mime_type, file_name, alt_text, status)
    VALUES (?, ?, ?, ?, 'image', 'external_url', 'template',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=70',
      'image/jpeg', 'hero.jpg', ?, 'active')
  `).bind(heroMediaId, organizationId, siteId, locationId, `${restaurantName} hero image`))

  statements.push(db.prepare(`
    UPDATE business_locations
    SET hero_image_asset_id = ?
    WHERE id = ?
  `).bind(heroMediaId, locationId))

  // ── Story image ───────────────────────────────────────────────────────────
  statements.push(db.prepare(`
    INSERT OR IGNORE INTO media_assets
      (id, organization_id, site_id, location_id, kind, provider, source,
       public_url, thumbnail_url, mime_type, file_name, alt_text, status)
    VALUES (?, ?, ?, ?, 'image', 'external_url', 'template',
      'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1400&q=85',
      'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=600&q=70',
      'image/jpeg', 'story.jpg', ?, 'active')
  `).bind(storyMediaId, organizationId, siteId, locationId, `${restaurantName} story image`))

  // ── Sample menu ───────────────────────────────────────────────────────────
  statements.push(db.prepare(`
    INSERT OR IGNORE INTO menus (id, organization_id, site_id, location_id, name, status)
    VALUES (?, ?, ?, ?, 'Menu', 'published')
  `).bind(menuId, organizationId, siteId, locationId))

  const menuItems = [
    ['Starter', 'Sample Starter', 'starter', 'A delicious way to begin — update this with your actual starter.', '$8'],
    ['Starter', 'Soup of the Day', 'soup', 'Ask your server. Made fresh daily.', '$7'],
    ['Mains', 'House Special', 'house-special', 'Your signature dish goes here. Update with name, description, and price.', '$18'],
    ['Mains', 'Chef\'s Recommendation', 'chefs-rec', 'The dish your team is most proud of.', '$20'],
    ['Mains', 'Vegetarian Option', 'vegetarian', 'A plant-based option for every menu.', '$15'],
    ['Desserts', 'Dessert of the Day', 'dessert', 'Ask your server what is on today.', '$7'],
    ['Drinks', 'House Lemonade', 'lemonade', 'Made fresh each morning.', '$4'],
    ['Drinks', 'Soft Drink', 'soft-drink', 'Pepsi, Diet Pepsi, or lemonade.', '$3'],
  ]

  for (let i = 0; i < menuItems.length; i++) {
    const [section, name, slug, description, price] = menuItems[i]!
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO menu_items
        (id, menu_id, section, name, slug, description, price, available, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(uid('mi'), menuId, section, name, slug, description, price, i))
  }

  // ── Sample reviews ────────────────────────────────────────────────────────
  const reviews = [
    ['Guest', 5, 'Absolutely loved it. Will definitely be back — the food was excellent and the service was warm and attentive.'],
    ['Local Diner', 4, 'Really enjoyable experience. Great atmosphere, solid menu. The mains were the highlight.'],
    ['First Timer', 5, 'Found this place on a recommendation and it exceeded expectations. The food is genuinely good.'],
  ]

  for (const [author, rating, content] of reviews) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO reviews
        (id, organization_id, site_id, location_id, author_name, rating, content, status, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', 'template')
    `).bind(uid('rev'), organizationId, siteId, locationId, author, rating, content))
  }

  // ── Sample Q&A ────────────────────────────────────────────────────────────
  const qa = [
    ['Do you take reservations?', 'Yes — you can book a table through our reservations page or call us directly.', 1],
    ['Do you have vegetarian or vegan options?', 'Yes, we have vegetarian options on the menu. Ask your server about vegan modifications.', 2],
    ['Is there parking nearby?', 'Yes — there is parking available nearby. See our contact page for directions.', 3],
  ]

  for (const [question, answer, order] of qa) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO location_qa
        (id, organization_id, site_id, location_id, question, answer, answer_author,
         is_owner_answer, source, status, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'template', 'published', ?)
    `).bind(uid('qa'), organizationId, siteId, locationId, question, answer, restaurantName, order))
  }

  // ── Sample post ───────────────────────────────────────────────────────────
  const postId = uid('post')
  statements.push(db.prepare(`
    INSERT OR IGNORE INTO posts
      (id, organization_id, site_id, location_id, post_type, title, body,
       status, published_at, created_by)
    VALUES (?, ?, ?, ?, 'update', 'Welcome to our new website',
      'We just launched our new site — you can now browse our full menu, check our hours, and book a table online. More updates coming soon.',
      'published', datetime('now'), 'system')
  `).bind(postId, organizationId, siteId, locationId))

  statements.push(db.prepare(`
    INSERT OR IGNORE INTO post_channel_jobs (id, post_id, organization_id, channel, status, published_at)
    VALUES (?, ?, ?, 'site', 'published', datetime('now'))
  `).bind(uid('pcj'), postId, organizationId))

  // ── Homepage CTA + about page content ────────────────────────────────────
  const siteContent = [
    ['home', 'cta.title', 'Come hungry.'],
    ['about', 'hero.title', 'About Us'],
    ['about', 'hero.subtitle', `${restaurantName} is built around generous food, warm service, and a room that feels easy to return to.`],
    ['about', 'story.image', storyMediaId, 'media'],
    ['about', 'story.title', 'Our Story'],
    ['about', 'story.body', `${restaurantName} started with a simple idea: make the food we love, serve it with care, and keep the welcome honest.\n\nToday, that same idea guides every part of the restaurant, from the first prep list of the morning to the last table of the night.`],
    ['about', 'journey.title', 'Our Journey'],
    ['about', 'journey.body', `${restaurantName} is a neighbourhood restaurant focused on doing a small number of things exceptionally well.\n\nAdd the milestones that shaped your restaurant: where you started, what changed along the way, and what guests can expect when they walk through the door.`],
    ['about', 'cta.title', 'Come dine with us'],
  ]

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
