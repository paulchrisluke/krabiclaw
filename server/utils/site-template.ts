// Seed a newly created site with template content so owners see a populated
// site on day one — ready to replace with real data.
// All records use source='template' so ChowBot can identify and reference them.

import type { SiteVertical } from "~/utils/vertical-copy";
import { executeBatch, queryFirst, type BatchQuery, type DbClient } from "~/server/db";

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

// Per-vertical menu sections. Restaurant uses the familiar 4-section layout;
// other verticals that don't have a menu get no menu seeded.
const VERTICAL_MENU_SECTIONS: Partial<
  Record<SiteVertical, Array<[string, string, string, string, number]>>
> = {
  restaurant: [
    [
      "Starter",
      "Sample Starter",
      "starter",
      "A delicious way to begin. Update this with your actual starter.",
      8,
    ],
    [
      "Starter",
      "Soup of the Day",
      "soup",
      "Ask your server. Made fresh daily.",
      7,
    ],
    [
      "Mains",
      "House Special",
      "house-special",
      "Your signature dish goes here. Update with name, description, and price.",
      18,
    ],
    [
      "Mains",
      "Chef's Recommendation",
      "chefs-rec",
      "The dish your team is most proud of.",
      20,
    ],
    [
      "Mains",
      "Vegetarian Option",
      "vegetarian",
      "A plant-based option for every menu.",
      15,
    ],
    [
      "Desserts",
      "Dessert of the Day",
      "dessert",
      "Ask your server what is on today.",
      7,
    ],
    ["Drinks", "House Lemonade", "lemonade", "Made fresh each morning.", 4],
    [
      "Drinks",
      "Soft Drink",
      "soft-drink",
      "Pepsi, Diet Pepsi, or lemonade.",
      3,
    ],
  ],
};

// Per-vertical Q&A seeds
const VERTICAL_QA: Partial<
  Record<SiteVertical, Array<[string, string, number]>>
> = {
  restaurant: [
    [
      "Do you take reservations?",
      "Yes — you can book a table through our reservations page or call us directly.",
      1,
    ],
    [
      "Do you have vegetarian or vegan options?",
      "Yes, we have vegetarian options on the menu. Ask your server about vegan modifications.",
      2,
    ],
    [
      "Is there parking nearby?",
      "Yes — there is parking available nearby. See our contact page for directions.",
      3,
    ],
  ],
  experience: [
    [
      "How do I book a class?",
      "You can book a class or session directly from our experiences page.",
      1,
    ],
    [
      "What should I bring?",
      "Comfortable clothes and an open mind. We provide all the materials and tools needed.",
      2,
    ],
    [
      "Is there parking nearby?",
      "Yes — there is parking available nearby. See our contact page for directions.",
      3,
    ],
  ],
  professional_service: [
    [
      "How do I request a consultation?",
      "You can request a consultation through our contact page or by reaching out directly.",
      1,
    ],
    [
      "What services do you offer?",
      "Update this with the services or practice areas your organization provides.",
      2,
    ],
    [
      "How can I get in touch?",
      "See our contact page for phone, email, and office details.",
      3,
    ],
  ],
};

// Per-vertical site_content seeds. No stock story image: SayaBrandStory already
// renders a clean single-column layout with no image rather than a photo that
// isn't actually the business's own.
const VERTICAL_SITE_CONTENT: Partial<
  Record<SiteVertical, (_name: string) => Array<[string, string, string, string?]>>
> = {
  restaurant: (name) => [
    ["home", "cta.title", "Come hungry."],
    ["about", "hero.title", "About Us"],
    [
      "about",
      "hero.subtitle",
      `${name} is built around generous food, warm service, and a room that feels easy to return to.`,
    ],
    ["about", "story.headline", "Our Story"],
    [
      "about",
      "story.body",
      `${name} started with a simple idea: make the food we love, serve it with care, and keep the welcome honest.\n\nToday, that same idea guides every part of the restaurant, from the first prep list of the morning to the last table of the night.`,
    ],
    ["about", "journey.title", "Our Journey"],
    [
      "about",
      "journey.body",
      `${name} is a neighbourhood restaurant focused on doing a small number of things exceptionally well.\n\nAdd the milestones that shaped your restaurant: where you started, what changed along the way, and what guests can expect when they walk through the door.`,
    ],
    ["about", "cta.title", "Come dine with us"],
  ],
  experience: (name) => [
    ["home", "cta.title", "Book a class."],
    ["about", "hero.title", "About Us"],
    [
      "about",
      "hero.subtitle",
      `${name} is built around hands-on learning, skilled instruction, and a space that invites you to try something new.`,
    ],
    ["about", "story.headline", "Our Story"],
    [
      "about",
      "story.body",
      `${name} started with a simple idea: share a skill, build a community, and make the process enjoyable from start to finish.\n\nToday, that same idea shapes every class, workshop, and session we offer.`,
    ],
    ["about", "journey.title", "Our Journey"],
    [
      "about",
      "journey.body",
      `${name} is a hands-on studio focused on doing a small number of things exceptionally well.\n\nAdd the milestones that shaped your studio: where you started, what changed along the way, and what guests can expect when they arrive.`,
    ],
    ["about", "cta.title", "Book a class"],
  ],
  professional_service: (name) => [
    ["home", "cta.title", "Talk with our team."],
    ["about", "hero.title", "About Us"],
    [
      "about",
      "hero.subtitle",
      `${name} is built around clear guidance, responsive service, and a team clients can rely on.`,
    ],
    ["about", "story.headline", "Our Story"],
    [
      "about",
      "story.body",
      `${name} started with a simple idea: offer dependable, professional service and keep clients informed every step of the way.\n\nAdd your organization's own story here — who you serve, how you work, and what clients can expect when they reach out.`,
    ],
    ["about", "journey.title", "Our Journey"],
    [
      "about",
      "journey.body",
      `${name} is a professional-service organization focused on doing right by the people it serves.\n\nAdd the milestones that shaped your organization: where you started, what changed along the way, and what clients can expect when they get in touch. Replace this placeholder with your own services or practice areas — none are assumed here.`,
    ],
    ["about", "cta.title", "Talk with our team"],
  ],
};

export async function seedNewSite(
  db: DbClient,
  params: {
    organizationId: string;
    siteId: string;
    name: string;
    vertical: SiteVertical;
  },
): Promise<void> {
  if (!db) throw new Error("Database not configured");

  const { organizationId, siteId, name, vertical } = params;

  // Reuse existing location on resume (site may have failed mid-seed)
  const existing = await queryFirst<{ id: string }>(
    db,
    "SELECT id FROM business_locations WHERE site_id = ? AND slug = ? LIMIT 1",
    [siteId, "main"],
  );
  const locationId = existing?.id ?? uid("loc");

  const statements: BatchQuery[] = [];

  // Canonical language setup for new Saya sites.
  statements.push({
    query: `
    INSERT OR REPLACE INTO site_config (organization_id, site_id, key, value)
    VALUES (?, ?, 'source_locale', 'en')
  `,
    params: [organizationId, siteId],
  });
  statements.push({
    query: `
    INSERT OR REPLACE INTO site_locales
      (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled)
    VALUES (?, ?, ?, 'en', 'English', 1, 'published', 1)
  `,
    params: [`locale::${organizationId}::${siteId}::en`, organizationId, siteId],
  });

  // ── Location ──────────────────────────────────────────────────────────────
  statements.push({
    query: `
    INSERT OR IGNORE INTO business_locations
      (id, organization_id, site_id, slug, title, city, description, opening_hours,
       rating, review_count, is_primary, status)
    VALUES (?, ?, ?, 'main', ?, 'Your City',
      'Add your description here — what makes your place special and why guests keep coming back.',
      '[{"openDay":"MONDAY","openTime":"09:00","closeTime":"18:00"},{"openDay":"TUESDAY","openTime":"09:00","closeTime":"18:00"},{"openDay":"WEDNESDAY","openTime":"09:00","closeTime":"18:00"},{"openDay":"THURSDAY","openTime":"09:00","closeTime":"18:00"},{"openDay":"FRIDAY","openTime":"09:00","closeTime":"18:00"},{"openDay":"SATURDAY","openTime":"10:00","closeTime":"17:00"}]',
      0, 0, 1, 'active')
  `,
    params: [locationId, organizationId, siteId, name],
  });

  // createLocation() in location-management.ts normally syncs this when a
  // location becomes primary — this raw seed insert bypasses that helper, so
  // it must be kept in sync here or sites.primary_location_id stays NULL.
  statements.push({
    query: `
    UPDATE sites
    SET primary_location_id = ?
    WHERE id = ? AND organization_id = ? AND primary_location_id IS NULL
  `,
    params: [locationId, siteId, organizationId],
  });

  // No stock hero/story media seeded here: a generic stock photo isn't actually
  // theirs. The homepage hero renders a brand-color + icon treatment instead
  // (SayaHomeHero.vue), and the public location page falls back to the same
  // treatment (pages/locations/[slug]/index.vue) when hero_image_asset_id is unset.

  // ── Sample menu (restaurant only) ─────────────────────────────────────────
  const menuItems = VERTICAL_MENU_SECTIONS[vertical];
  if (menuItems && menuItems.length > 0) {
    const menuId = uid("menu");
    statements.push({
      query: `
      INSERT OR IGNORE INTO menus (id, organization_id, site_id, location_id, name, status)
      VALUES (?, ?, ?, ?, 'Menu', 'published')
    `,
      params: [menuId, organizationId, siteId, locationId],
    });

    for (let i = 0; i < menuItems.length; i++) {
      const [section, itemName, slug, description, price] = menuItems[i]!;
      statements.push({
        query: `
        INSERT OR IGNORE INTO menu_items
          (id, menu_id, section, name, slug, description, price_amount, available, sort_order, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'template')
      `,
        params: [
          uid("mi"),
          menuId,
          section,
          itemName,
          slug,
          description,
          price,
          i,
        ],
      });
    }
  }

  // ── Sample Q&A ────────────────────────────────────────────────────────────
  const qa = VERTICAL_QA[vertical] ?? VERTICAL_QA.restaurant!;
  for (const [question, answer, order] of qa) {
    statements.push({
      query: `
      INSERT OR IGNORE INTO location_qa
        (id, organization_id, site_id, location_id, question, answer, answer_author,
         is_owner_answer, source, status, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'template', 'published', ?)
    `,
      params: [
        uid("qa"),
        organizationId,
        siteId,
        locationId,
        question,
        answer,
        name,
        order,
      ],
    });
  }

  // ── Sample post ───────────────────────────────────────────────────────────
  const postId = uid("post");
  const postBody =
    vertical === "restaurant"
      ? "We just launched our new site — you can now browse our full menu, check our hours, and book a table online. More updates coming soon."
      : vertical === "professional_service"
        ? "We just launched our new site — you can now learn about our services and get in touch with our team. More updates coming soon."
        : "We just launched our new site — you can now browse what we offer, check our hours, and get in touch. More updates coming soon.";
  statements.push({
    query: `
    INSERT OR IGNORE INTO posts
      (id, organization_id, site_id, location_id, post_type, title, body,
       status, published_at, created_by, source)
    VALUES (?, ?, ?, ?, 'update', 'Welcome to our new website',
      ?,
      'published', datetime('now'), 'system', 'template')
  `,
    params: [postId, organizationId, siteId, locationId, postBody],
  });

  statements.push({
    query: `
    INSERT OR IGNORE INTO post_channel_jobs (id, post_id, organization_id, channel, status, published_at)
    VALUES (?, ?, ?, 'site', 'published', datetime('now'))
  `,
    params: [uid("pcj"), postId, organizationId],
  });

  // ── Homepage CTA + about page content (vertical-specific) ─────────────────
  const siteContentFn =
    VERTICAL_SITE_CONTENT[vertical] ?? VERTICAL_SITE_CONTENT.restaurant!;
  const siteContent = siteContentFn(name);

  for (const [page, field, content, type] of siteContent) {
    const contentType = type ?? "text";
    statements.push({
      query: `
      INSERT OR IGNORE INTO site_content
        (id, organization_id, site_id, location_id, page, field, content, type, source)
      VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'template')
    `,
      params: [
        uid("sc"),
        organizationId,
        siteId,
        page,
        field,
        content,
        contentType,
      ],
    });
  }

  await executeBatch(db, statements);
}
