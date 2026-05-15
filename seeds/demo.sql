-- Demo seed for local development — Saya theme showcase
-- Preview at: http://demo.localhost:3000
-- Idempotent: safe to re-run with yarn seed:local

-- ── Theme ────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO themes (id, name, slug, version, description, status)
VALUES ('saya-theme-v1', 'Saya', 'saya', '1.0.0', 'Restaurant website theme', 'active');

-- ── User ─────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
VALUES ('user-demo', 'Demo Owner', 'demo@krabiclaw.com', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ── Organization ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO organization (id, name, slug, createdAt)
VALUES ('org-demo', "Hoff's Hogies", 'hoffs-hogies-demo', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt)
VALUES ('member-demo', 'org-demo', 'user-demo', 'owner', CURRENT_TIMESTAMP);

-- ── Site ─────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO sites (id, organization_id, theme_id, slug, subdomain, status, onboarding_status)
VALUES ('site-demo', 'org-demo', 'saya-theme-v1', 'hoffs-hogies-demo', 'demo', 'active', 'active');

INSERT OR IGNORE INTO site_domains (id, organization_id, site_id, domain, type, status)
VALUES ('domain-demo', 'org-demo', 'site-demo', 'demo.localhost', 'subdomain', 'active');

-- ── Location (without image FK — set below after media insert) ───────────────
INSERT OR IGNORE INTO business_locations (
  id, organization_id, site_id, slug, title, city,
  address, phone, maps_url,
  latitude, longitude,
  description, opening_hours,
  rating, review_count,
  is_primary, status
) VALUES (
  'loc-demo', 'org-demo', 'site-demo', 'buffalo', 'The Hoagie Stop', 'Buffalo',
  '{"addressLines":["2285 Main St"],"locality":"Buffalo","administrativeArea":"NY","postalCode":"14214","country":"US"}',
  '(716) 555-0190', 'https://maps.app.goo.gl/buffalo-hoagie-stop',
  42.9317, -78.8714,
  'Classic Buffalo hoagies built on fresh-baked bread with house-made spreads. One location, one kitchen, no shortcuts.',
  '[{"openDay":"MONDAY","openTime":"10:00","closeTime":"20:00"},{"openDay":"TUESDAY","openTime":"10:00","closeTime":"20:00"},{"openDay":"WEDNESDAY","openTime":"10:00","closeTime":"20:00"},{"openDay":"THURSDAY","openTime":"10:00","closeTime":"20:00"},{"openDay":"FRIDAY","openTime":"10:00","closeTime":"21:00"},{"openDay":"SATURDAY","openTime":"10:00","closeTime":"21:00"},{"openDay":"SUNDAY","openTime":"11:00","closeTime":"18:00"}]',
  4.7, 142, 1, 'active'
);

-- ── Media assets (after location, before menu_items/posts that reference them)
INSERT OR IGNORE INTO media_assets (id, organization_id, site_id, location_id, kind, provider, source, public_url, thumbnail_url, mime_type, file_name, alt_text, status)
VALUES
  -- Hero / location card image
  ('media-demo-hero', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=1200&q=80',
   'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=600&q=70',
   'image/jpeg', 'hero.jpg', 'The Hoagie Stop counter', 'active'),
  -- Menu item: Italian Combo
  ('media-demo-italian', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',
   'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=70',
   'image/jpeg', 'italian-combo.jpg', 'Italian combo hoagie', 'active'),
  -- Menu item: Roast Beef
  ('media-demo-roastbeef', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&q=80',
   'https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&q=70',
   'image/jpeg', 'roast-beef.jpg', 'Roast beef hoagie', 'active'),
  -- Menu item: Buffalo Chicken
  ('media-demo-buffalo', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=800&q=80',
   'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400&q=70',
   'image/jpeg', 'buffalo-chicken.jpg', 'Buffalo chicken hoagie', 'active'),
  -- Post images
  ('media-demo-post1', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80',
   'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=70',
   'image/jpeg', 'post-1.jpg', 'Restaurant dining room', 'active'),
  ('media-demo-post2', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80',
   'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=70',
   'image/jpeg', 'post-2.jpg', 'Restaurant ambiance', 'active'),
  ('media-demo-post3', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&q=80',
   'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=70',
   'image/jpeg', 'post-3.jpg', 'Restaurant exterior', 'active');

-- ── Wire hero image to location ───────────────────────────────────────────────
UPDATE business_locations SET hero_image_asset_id = 'media-demo-hero' WHERE id = 'loc-demo';

-- ── Reviews (6 with mixed ratings for a real star distribution) ───────────────
INSERT OR IGNORE INTO reviews (id, organization_id, site_id, location_id, author_name, rating, content, status, source)
VALUES
  ('rev-demo-1', 'org-demo', 'site-demo', 'loc-demo', 'Marcus T.', 5,
   'Best hoagie in Buffalo, no contest. The bread is baked fresh every morning and it shows. Get the Italian combo — it is everything.',
   'approved', 'google'),
  ('rev-demo-2', 'org-demo', 'site-demo', 'loc-demo', 'Sara K.', 5,
   'Came in for lunch on a weekday and it was absolutely packed. That tells you everything. Massive portions, fair prices, genuinely friendly staff.',
   'approved', 'google'),
  ('rev-demo-3', 'org-demo', 'site-demo', 'loc-demo', 'Derek M.', 4,
   'Solid neighbourhood spot. The roast beef is the move. Lines move fast even when it is busy. Only reason it is not 5 stars is the parking situation.',
   'approved', 'google'),
  ('rev-demo-4', 'org-demo', 'site-demo', 'loc-demo', 'Jenna L.', 5,
   'I drove 40 minutes specifically for the meatball parm. Zero regrets. This place is the real deal.',
   'approved', 'google'),
  ('rev-demo-5', 'org-demo', 'site-demo', 'loc-demo', 'Chris B.', 4,
   'Great hoagies, generous with the toppings. Turkey club is my go-to. Service is fast and the people working there clearly enjoy what they do.',
   'approved', 'google'),
  ('rev-demo-6', 'org-demo', 'site-demo', 'loc-demo', 'Amy W.', 3,
   'Decent food but it was very busy when I went and wait time was longer than expected. The hoagie itself was good though — will come back on a quieter day.',
   'approved', 'google');

-- ── Menu ─────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO menus (id, organization_id, site_id, location_id, name, status)
VALUES ('menu-demo', 'org-demo', 'site-demo', 'loc-demo', 'Menu', 'published');

INSERT OR IGNORE INTO menu_items (id, menu_id, section, name, slug, description, price, image_asset_id, available, sort_order)
VALUES
  ('mi-1', 'menu-demo', 'Cold Hoagies', 'Italian Combo', 'italian-combo',
   'Genoa salami, capicola, provolone, shredded lettuce, tomato, onion, oil and vinegar on a fresh-baked roll',
   '$11', 'media-demo-italian', 1, 1),
  ('mi-2', 'menu-demo', 'Cold Hoagies', 'Turkey Club', 'turkey-club',
   'Sliced turkey breast, swiss, bacon, lettuce, tomato, mayo',
   '$12', NULL, 1, 2),
  ('mi-3', 'menu-demo', 'Cold Hoagies', 'Veggie', 'veggie',
   'Provolone, roasted peppers, cucumber, lettuce, tomato, oil and vinegar',
   '$10', NULL, 1, 3),
  ('mi-4', 'menu-demo', 'Hot Hoagies', 'Roast Beef', 'roast-beef',
   'Slow-roasted beef, melted provolone, horseradish mayo, au jus on the side',
   '$13', 'media-demo-roastbeef', 1, 1),
  ('mi-5', 'menu-demo', 'Hot Hoagies', 'Meatball Parm', 'meatball-parm',
   'House-made meatballs, marinara, fresh mozzarella, toasted roll',
   '$12', NULL, 1, 2),
  ('mi-6', 'menu-demo', 'Hot Hoagies', 'Buffalo Chicken', 'buffalo-chicken',
   'Crispy fried chicken, Frank''s RedHot, blue cheese, celery, pickled onion',
   '$13', 'media-demo-buffalo', 1, 3),
  ('mi-7', 'menu-demo', 'Sides', 'House Chips', 'house-chips',
   'Kettle-cooked in small batches with sea salt',
   '$3', NULL, 1, 1),
  ('mi-8', 'menu-demo', 'Sides', 'Pickle Spear', 'pickle-spear',
   'Half-sour, house-brined',
   '$1', NULL, 1, 2),
  ('mi-9', 'menu-demo', 'Drinks', 'Fountain Soda', 'fountain-soda',
   'Pepsi, Diet Pepsi, Mountain Dew, or lemonade',
   '$2', NULL, 1, 1),
  ('mi-10', 'menu-demo', 'Drinks', 'Bottled Water', 'bottled-water',
   'Still or sparkling',
   '$2', NULL, 1, 2);

-- ── Location Q&A ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO location_qa (id, organization_id, site_id, location_id, question, question_author, answer, answer_author, is_owner_answer, upvote_count, source, status, sort_order)
VALUES
  ('qa-demo-1', 'org-demo', 'site-demo', 'loc-demo',
   'Do you take reservations?', 'A Guest',
   'We are walk-in only — no reservations. Lines move quickly and we have never had anyone wait longer than 15 minutes.',
   'The Hoagie Stop', 1, 12, 'manual', 'published', 1),
  ('qa-demo-2', 'org-demo', 'site-demo', 'loc-demo',
   'Is the bread made in-house?', 'Another Guest',
   'Yes — we bake our rolls fresh every morning. It is a big reason people keep coming back.',
   'The Hoagie Stop', 1, 9, 'manual', 'published', 2),
  ('qa-demo-3', 'org-demo', 'site-demo', 'loc-demo',
   'Do you have gluten-free options?', 'A Guest',
   'Not currently. Our kitchen uses wheat flour extensively and we cannot guarantee cross-contamination avoidance.',
   'The Hoagie Stop', 1, 4, 'manual', 'published', 3),
  ('qa-demo-4', 'org-demo', 'site-demo', 'loc-demo',
   'What are your busiest times?', 'A Guest',
   'Weekday lunch (11:30am–1pm) is our peak. If you want the fastest experience, come before 11am or after 2pm.',
   'The Hoagie Stop', 1, 7, 'manual', 'published', 4),
  ('qa-demo-5', 'org-demo', 'site-demo', 'loc-demo',
   'Do you cater?', 'Event Planner',
   'Yes — we do catering for groups of 10 or more. Call us directly to discuss your order and lead time.',
   'The Hoagie Stop', 1, 3, 'manual', 'published', 5);

-- ── Posts ─────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO posts (id, organization_id, site_id, location_id, post_type, title, body, image_asset_id, status, published_at, created_by)
VALUES
  ('post-demo-1', 'org-demo', 'site-demo', 'loc-demo',
   'update', 'New hours starting this week',
   'We have extended our Friday and Saturday hours to 9pm to accommodate the dinner crowd. Come hungry.',
   'media-demo-post1', 'published', '2026-05-01T12:00:00.000Z', 'user-demo'),
  ('post-demo-2', 'org-demo', 'site-demo', 'loc-demo',
   'standard', NULL,
   'The meatball parm is back after a two-week hiatus. We sourced better San Marzano tomatoes for the sauce. Worth the wait.',
   'media-demo-post2', 'published', '2026-04-18T10:00:00.000Z', 'user-demo'),
  ('post-demo-3', 'org-demo', 'site-demo', 'loc-demo',
   'offer', 'Buy two hoagies, get chips free',
   'Every Tuesday in May. No code needed — just mention it when you order. One offer per visit.',
   'media-demo-post3', 'published', '2026-04-10T09:00:00.000Z', 'user-demo');

-- ── Post channel jobs (so posts appear as "site published") ───────────────────
INSERT OR IGNORE INTO post_channel_jobs (id, post_id, organization_id, channel, status, published_at)
VALUES
  ('pcj-demo-1', 'post-demo-1', 'org-demo', 'site', 'published', '2026-05-01T12:00:00.000Z'),
  ('pcj-demo-2', 'post-demo-2', 'org-demo', 'site', 'published', '2026-04-18T10:00:00.000Z'),
  ('pcj-demo-3', 'post-demo-3', 'org-demo', 'site', 'published', '2026-04-10T09:00:00.000Z');

-- ── Site content (about + homepage CTA) ──────────────────────────────────────
INSERT OR IGNORE INTO site_content (id, organization_id, site_id, location_id, page, field, content, type, source)
VALUES
  ('sc-demo-cta', 'org-demo', 'site-demo', NULL,
   'home', 'cta.title', 'Come hungry.', 'text', 'manual'),
  ('sc-demo-journey', 'org-demo', 'site-demo', NULL,
   'about', 'journey.body',
   'Hoff started making hoagies out of his garage in 2011 — a folding table, a bread knife, and a standing order from his block. By 2013 he had a spot on Main Street. By 2016 there was a line out the door every day.

No secret formula. Just good bread, good meat, and the same sandwich he made at that folding table.',
   'textarea', 'manual'),
  ('sc-demo-story-intro', 'org-demo', 'site-demo', NULL,
   'about', 'story.intro',
   'One location. One kitchen. No shortcuts.',
   'text', 'manual'),
  ('sc-demo-experience', 'org-demo', 'site-demo', NULL,
   'about', 'experience.body',
   'We do not do loyalty apps, or seasonal menus, or limited-edition collabs. We do sandwiches. The same ones, made the same way, every single day.

If it is on the board, it is good. If it is not on the board, we do not make it.',
   'textarea', 'manual');
