-- Demo seed for local development — Saya theme showcase
-- Preview at: http://demo.localhost:3000
-- Production at: https://demo.krabiclaw.com
-- Idempotent: safe to re-run with yarn seed:local or yarn seed:remote --confirm-production

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
INSERT OR IGNORE INTO sites (
  id, organization_id, theme_id, theme, slug, subdomain,
  brand_name, brand_description,
  status, plan, onboarding_status, url_structure
) VALUES (
  'site-demo', 'org-demo', 'saya-theme-v1', 'saya', 'hoffs-hogies-demo', 'demo',
  "Hoff's Hogies",
  'Classic Buffalo hoagies built on fresh-baked bread with house-made spreads.',
  'active', 'free', 'active', 'location_subdirectories'
);

-- Backfill brand fields and link primary location on re-runs
UPDATE sites SET
  brand_name        = "Hoff's Hogies",
  brand_description = 'Classic Buffalo hoagies built on fresh-baked bread with house-made spreads.',
  theme             = 'saya',
  primary_location_id = 'loc-demo'
WHERE id = 'site-demo';

-- ── Site domains ─────────────────────────────────────────────────────────────
-- domain-demo-local: kept secondary so the .localhost dev path is unaffected
-- domain-demo-prod:  canonical — production canonical redirect target
INSERT OR IGNORE INTO site_domains (id, organization_id, site_id, domain, type, role, status, dns_status)
VALUES
  ('domain-demo-local', 'org-demo', 'site-demo', 'demo.localhost',      'subdomain', 'secondary', 'active', 'valid'),
  ('domain-demo-prod',  'org-demo', 'site-demo', 'demo.krabiclaw.com',  'subdomain', 'canonical', 'active', 'valid');

-- Ensure role/status are correct on re-runs regardless of which row was inserted first
UPDATE site_domains SET dns_status = 'valid', status = 'active'
  WHERE domain = 'demo.localhost' AND site_id = 'site-demo';
UPDATE site_domains SET role = 'canonical', dns_status = 'valid', status = 'active'
  WHERE domain = 'demo.krabiclaw.com' AND site_id = 'site-demo';

-- ── Location ─────────────────────────────────────────────────────────────────
-- hero_image_asset_id set below after media insert
INSERT OR IGNORE INTO business_locations (
  id, organization_id, site_id, slug, title, city,
  address, phone, email, maps_url,
  latitude, longitude,
  description, short_description,
  opening_hours,
  rating, review_count,
  price_level, categories,
  instagram_url, facebook_url,
  is_primary, status
) VALUES (
  'loc-demo', 'org-demo', 'site-demo', 'buffalo', 'The Hoagie Stop', 'Buffalo',
  '{"addressLines":["2285 Main St"],"locality":"Buffalo","administrativeArea":"NY","postalCode":"14214","country":"US"}',
  '(716) 555-0190',
  'hello@hoffshoagies.com',
  'https://maps.app.goo.gl/buffalo-hoagie-stop',
  42.9317, -78.8714,
  'Classic Buffalo hoagies built on fresh-baked bread with house-made spreads. One location, one kitchen, no shortcuts.',
  'Fresh-baked rolls. House-made spreads. Buffalo''s best hoagie.',
  '[{"openDay":"MONDAY","openTime":"10:00","closeTime":"20:00"},{"openDay":"TUESDAY","openTime":"10:00","closeTime":"20:00"},{"openDay":"WEDNESDAY","openTime":"10:00","closeTime":"20:00"},{"openDay":"THURSDAY","openTime":"10:00","closeTime":"20:00"},{"openDay":"FRIDAY","openTime":"10:00","closeTime":"21:00"},{"openDay":"SATURDAY","openTime":"10:00","closeTime":"21:00"},{"openDay":"SUNDAY","openTime":"11:00","closeTime":"18:00"}]',
  4.7, 142,
  '$$',
  '["Sandwich Shop","Hoagie","Deli"]',
  'https://instagram.com/hoffshoagies',
  'https://facebook.com/hoffshoagies',
  1, 'active'
);

-- Backfill new fields on re-runs
UPDATE business_locations SET
  email             = 'hello@hoffshoagies.com',
  short_description = 'Fresh-baked rolls. House-made spreads. Buffalo''s best hoagie.',
  price_level       = '$$',
  categories        = '["Sandwich Shop","Hoagie","Deli"]',
  instagram_url     = 'https://instagram.com/hoffshoagies',
  facebook_url      = 'https://facebook.com/hoffshoagies'
WHERE id = 'loc-demo';

-- ── Media assets ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO media_assets
  (id, organization_id, site_id, location_id,
   kind, provider, source,
   public_url, thumbnail_url,
   mime_type, file_name, alt_text, category, status)
VALUES
  -- ─ Hero / location card (interior — counter) ─
  ('media-demo-hero', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=1200&q=80',
   'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=600&q=70',
   'image/jpeg', 'hero.jpg', 'The Hoagie Stop counter', 'interior', 'active'),

  -- ─ Gallery: exterior ─
  ('media-demo-ext-1', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&q=80',
   'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=70',
   'image/jpeg', 'exterior-1.jpg', 'Restaurant storefront', 'exterior', 'active'),
  ('media-demo-ext-2', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1537047902294-62a40c20a6ae?w=1200&q=80',
   'https://images.unsplash.com/photo-1537047902294-62a40c20a6ae?w=600&q=70',
   'image/jpeg', 'exterior-2.jpg', 'Street-facing entrance', 'exterior', 'active'),

  -- ─ Gallery: interior ─
  ('media-demo-int-1', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80',
   'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=70',
   'image/jpeg', 'interior-dining.jpg', 'Dining room', 'interior', 'active'),
  ('media-demo-int-2', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80',
   'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=70',
   'image/jpeg', 'interior-ambiance.jpg', 'Restaurant ambiance', 'interior', 'active'),
  ('media-demo-int-3', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?w=1200&q=80',
   'https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?w=600&q=70',
   'image/jpeg', 'interior-bar.jpg', 'Counter and service area', 'interior', 'active'),

  -- ─ Gallery: team ─
  ('media-demo-team-1', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1581299894007-aaa50297cf16?w=1200&q=80',
   'https://images.unsplash.com/photo-1581299894007-aaa50297cf16?w=600&q=70',
   'image/jpeg', 'team.jpg', 'The Hoagie Stop kitchen team', 'team', 'active'),

  -- ─ Menu item images ─
  ('media-demo-italian', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',
   'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=70',
   'image/jpeg', 'italian-combo.jpg', 'Italian combo hoagie', 'food', 'active'),
  ('media-demo-roastbeef', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&q=80',
   'https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&q=70',
   'image/jpeg', 'roast-beef.jpg', 'Roast beef hoagie', 'food', 'active'),
  ('media-demo-buffalo', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=800&q=80',
   'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400&q=70',
   'image/jpeg', 'buffalo-chicken.jpg', 'Buffalo chicken hoagie', 'food', 'active'),

  -- ─ Additional food gallery shots ─
  ('media-demo-food-4', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=800&q=80',
   'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=400&q=70',
   'image/jpeg', 'food-4.jpg', 'Fresh hoagie close-up', 'food', 'active'),
  ('media-demo-food-5', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=800&q=80',
   'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&q=70',
   'image/jpeg', 'food-5.jpg', 'House chips and hoagie', 'food', 'active'),

  -- ─ Site-level: about/story hero (no location_id — used in site_content) ─
  ('media-demo-story', 'org-demo', 'site-demo', NULL,
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1400&q=85',
   'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=700&q=75',
   'image/jpeg', 'story-hero.jpg', 'The original sandwich counter — where it all started', 'interior', 'active'),

  -- ─ Post images ─
  ('media-demo-post1', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80',
   'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=70',
   'image/jpeg', 'post-1.jpg', 'Restaurant dining room', 'interior', 'active'),
  ('media-demo-post2', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80',
   'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=70',
   'image/jpeg', 'post-2.jpg', 'Restaurant ambiance', 'interior', 'active'),
  ('media-demo-post3', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&q=80',
   'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=70',
   'image/jpeg', 'post-3.jpg', 'Restaurant exterior', 'exterior', 'active');

-- Backfill category on any rows that were inserted without it
UPDATE media_assets SET category = 'interior'
  WHERE id IN ('media-demo-hero','media-demo-int-1','media-demo-int-2','media-demo-int-3','media-demo-post1','media-demo-post2','media-demo-story')
    AND category IS NULL;
UPDATE media_assets SET category = 'exterior'
  WHERE id IN ('media-demo-ext-1','media-demo-ext-2','media-demo-post3')
    AND category IS NULL;
UPDATE media_assets SET category = 'food'
  WHERE id IN ('media-demo-italian','media-demo-roastbeef','media-demo-buffalo','media-demo-food-4','media-demo-food-5')
    AND category IS NULL;
UPDATE media_assets SET category = 'team'
  WHERE id = 'media-demo-team-1' AND category IS NULL;

-- ── Wire hero image to location ───────────────────────────────────────────────
UPDATE business_locations SET hero_image_asset_id = 'media-demo-hero' WHERE id = 'loc-demo';

-- ── Reviews ───────────────────────────────────────────────────────────────────
-- 6 reviews with mixed ratings, reviewer avatars, and 3 owner replies
INSERT OR IGNORE INTO reviews
  (id, organization_id, site_id, location_id,
   author_name, reviewer_photo_url, rating, content,
   owner_reply, owner_reply_at,
   status, source)
VALUES
  ('rev-demo-1', 'org-demo', 'site-demo', 'loc-demo',
   'Marcus T.',
   'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&q=80',
   5,
   'Best hoagie in Buffalo, no contest. The bread is baked fresh every morning and it shows. Get the Italian combo — it is everything.',
   NULL, NULL,
   'approved', 'google'),

  ('rev-demo-2', 'org-demo', 'site-demo', 'loc-demo',
   'Sara K.',
   'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&q=80',
   5,
   'Came in for lunch on a weekday and it was absolutely packed. That tells you everything. Massive portions, fair prices, genuinely friendly staff.',
   'Thank you Sara — weekday lunches are our busiest and it means a lot to hear that. See you next time!',
   '2026-04-22T09:15:00.000Z',
   'approved', 'google'),

  ('rev-demo-3', 'org-demo', 'site-demo', 'loc-demo',
   'Derek M.',
   'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&q=80',
   4,
   'Solid neighbourhood spot. The roast beef is the move. Lines move fast even when it is busy. Only reason it is not 5 stars is the parking situation.',
   'Thanks Derek — parking on Main St is tough, we know. Street parking on Hertel one block up is usually the move. Hope to see you back!',
   '2026-04-15T11:30:00.000Z',
   'approved', 'google'),

  ('rev-demo-4', 'org-demo', 'site-demo', 'loc-demo',
   'Jenna L.',
   'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&q=80',
   5,
   'I drove 40 minutes specifically for the meatball parm. Zero regrets. This place is the real deal.',
   NULL, NULL,
   'approved', 'google'),

  ('rev-demo-5', 'org-demo', 'site-demo', 'loc-demo',
   'Chris B.',
   'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=96&q=80',
   4,
   'Great hoagies, generous with the toppings. Turkey club is my go-to. Service is fast and the people working there clearly enjoy what they do.',
   NULL, NULL,
   'approved', 'google'),

  ('rev-demo-6', 'org-demo', 'site-demo', 'loc-demo',
   'Amy W.',
   'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=96&q=80',
   3,
   'Decent food but it was very busy when I went and wait time was longer than expected. The hoagie itself was good though — will come back on a quieter day.',
   'Hi Amy — sorry your visit landed on a hectic one. Come before 11am or after 2pm and you will breeze right through. Hope to see you again soon!',
   '2026-03-30T14:45:00.000Z',
   'approved', 'google');

-- Backfill reviewer photos and owner replies on re-runs
UPDATE reviews SET reviewer_photo_url = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&q=80'
  WHERE id = 'rev-demo-1' AND reviewer_photo_url IS NULL;
UPDATE reviews SET
  reviewer_photo_url = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&q=80',
  owner_reply        = 'Thank you Sara — weekday lunches are our busiest and it means a lot to hear that. See you next time!',
  owner_reply_at     = '2026-04-22T09:15:00.000Z'
  WHERE id = 'rev-demo-2';
UPDATE reviews SET
  reviewer_photo_url = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&q=80',
  owner_reply        = 'Thanks Derek — parking on Main St is tough, we know. Street parking on Hertel one block up is usually the move. Hope to see you back!',
  owner_reply_at     = '2026-04-15T11:30:00.000Z'
  WHERE id = 'rev-demo-3';
UPDATE reviews SET reviewer_photo_url = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&q=80'
  WHERE id = 'rev-demo-4' AND reviewer_photo_url IS NULL;
UPDATE reviews SET reviewer_photo_url = 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=96&q=80'
  WHERE id = 'rev-demo-5' AND reviewer_photo_url IS NULL;
UPDATE reviews SET
  reviewer_photo_url = 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=96&q=80',
  owner_reply        = 'Hi Amy — sorry your visit landed on a hectic one. Come before 11am or after 2pm and you will breeze right through. Hope to see you again soon!',
  owner_reply_at     = '2026-03-30T14:45:00.000Z'
  WHERE id = 'rev-demo-6';

-- ── Menu ─────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO menus (id, organization_id, site_id, location_id, name, status)
VALUES ('menu-demo', 'org-demo', 'site-demo', 'loc-demo', 'Menu', 'published');

INSERT OR IGNORE INTO menu_items
  (id, menu_id, section, name, slug, description, price,
   image_asset_id, allergens, dietary_notes, available, sort_order)
VALUES
  ('mi-1', 'menu-demo', 'Cold Hoagies', 'Italian Combo', 'italian-combo',
   'Genoa salami, capicola, provolone, shredded lettuce, tomato, onion, oil and vinegar on a fresh-baked roll',
   '$11', 'media-demo-italian', 'Gluten, Dairy', NULL, 1, 1),

  ('mi-2', 'menu-demo', 'Cold Hoagies', 'Turkey Club', 'turkey-club',
   'Sliced turkey breast, swiss, bacon, lettuce, tomato, mayo',
   '$12', NULL, 'Gluten, Dairy', NULL, 1, 2),

  ('mi-3', 'menu-demo', 'Cold Hoagies', 'Veggie', 'veggie',
   'Provolone, roasted peppers, cucumber, lettuce, tomato, oil and vinegar',
   '$10', NULL, 'Gluten, Dairy', 'Vegetarian', 1, 3),

  ('mi-4', 'menu-demo', 'Hot Hoagies', 'Roast Beef', 'roast-beef',
   'Slow-roasted beef, melted provolone, horseradish mayo, au jus on the side',
   '$13', 'media-demo-roastbeef', 'Gluten, Dairy', NULL, 1, 1),

  ('mi-5', 'menu-demo', 'Hot Hoagies', 'Meatball Parm', 'meatball-parm',
   'House-made meatballs, marinara, fresh mozzarella, toasted roll',
   '$12', NULL, 'Gluten, Dairy, Eggs', NULL, 1, 2),

  ('mi-6', 'menu-demo', 'Hot Hoagies', 'Buffalo Chicken', 'buffalo-chicken',
   'Crispy fried chicken, Frank''s RedHot, blue cheese, celery, pickled onion',
   '$13', 'media-demo-buffalo', 'Gluten, Dairy, Eggs', NULL, 1, 3),

  ('mi-7', 'menu-demo', 'Sides', 'House Chips', 'house-chips',
   'Kettle-cooked in small batches with sea salt',
   '$3', NULL, NULL, 'Vegan, Gluten-free', 1, 1),

  ('mi-8', 'menu-demo', 'Sides', 'Pickle Spear', 'pickle-spear',
   'Half-sour, house-brined',
   '$1', NULL, NULL, 'Vegan, Gluten-free', 1, 2),

  ('mi-9', 'menu-demo', 'Drinks', 'Fountain Soda', 'fountain-soda',
   'Pepsi, Diet Pepsi, Mountain Dew, or lemonade',
   '$2', NULL, NULL, 'Vegan', 1, 1),

  ('mi-10', 'menu-demo', 'Drinks', 'Bottled Water', 'bottled-water',
   'Still or sparkling',
   '$2', NULL, NULL, 'Vegan, Gluten-free', 1, 2);

-- Backfill allergens/dietary_notes on re-runs
UPDATE menu_items SET allergens = 'Gluten, Dairy'
  WHERE id IN ('mi-1','mi-2','mi-4') AND allergens IS NULL;
UPDATE menu_items SET allergens = 'Gluten, Dairy', dietary_notes = 'Vegetarian'
  WHERE id = 'mi-3' AND allergens IS NULL;
UPDATE menu_items SET allergens = 'Gluten, Dairy, Eggs'
  WHERE id IN ('mi-5','mi-6') AND allergens IS NULL;
UPDATE menu_items SET dietary_notes = 'Vegan, Gluten-free'
  WHERE id IN ('mi-7','mi-8','mi-10') AND dietary_notes IS NULL;
UPDATE menu_items SET dietary_notes = 'Vegan'
  WHERE id = 'mi-9' AND dietary_notes IS NULL;

-- ── Location Q&A ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO location_qa
  (id, organization_id, site_id, location_id,
   question, question_author, answer, answer_author,
   is_owner_answer, upvote_count, source, status, sort_order)
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
INSERT OR IGNORE INTO posts
  (id, organization_id, site_id, location_id,
   post_type, title, body, image_asset_id,
   status, published_at, created_by)
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

-- ── Post channel jobs ─────────────────────────────────────────────────────────
INSERT OR IGNORE INTO post_channel_jobs (id, post_id, organization_id, channel, status, published_at)
VALUES
  ('pcj-demo-1', 'post-demo-1', 'org-demo', 'site', 'published', '2026-05-01T12:00:00.000Z'),
  ('pcj-demo-2', 'post-demo-2', 'org-demo', 'site', 'published', '2026-04-18T10:00:00.000Z'),
  ('pcj-demo-3', 'post-demo-3', 'org-demo', 'site', 'published', '2026-04-10T09:00:00.000Z');

-- ── Site content ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO site_content
  (id, organization_id, site_id, location_id,
   page, field, content, hero_title, hero_subtitle, hero_image_asset_id,
   type, source)
VALUES
  -- Home hero section
  ('sc-demo-home-hero', 'org-demo', 'site-demo', NULL,
   'home', 'hero', NULL,
   'Come hungry.',
   'Fresh-baked rolls. House-made spreads. One location, zero shortcuts.',
   'media-demo-hero',
   'text', 'manual'),

  -- Home CTA
  ('sc-demo-cta', 'org-demo', 'site-demo', NULL,
   'home', 'cta.title', 'Come hungry.', NULL, NULL, NULL,
   'text', 'manual'),

  -- About: story/origin section with hero image
  ('sc-demo-story-intro', 'org-demo', 'site-demo', NULL,
   'about', 'story.intro',
   'One location. One kitchen. No shortcuts.',
   'One location. One kitchen.',
   'No shortcuts.',
   'media-demo-story',
   'text', 'manual'),

  -- About: Hoff's journey
  ('sc-demo-journey', 'org-demo', 'site-demo', NULL,
   'about', 'journey.body',
   'Hoff started making hoagies out of his garage in 2011 — a folding table, a bread knife, and a standing order from his block. By 2013 he had a spot on Main Street. By 2016 there was a line out the door every day.

No secret formula. Just good bread, good meat, and the same sandwich he made at that folding table.',
   NULL, NULL, NULL,
   'textarea', 'manual'),

  -- About: experience/philosophy
  ('sc-demo-experience', 'org-demo', 'site-demo', NULL,
   'about', 'experience.body',
   'We do not do loyalty apps, or seasonal menus, or limited-edition collabs. We do sandwiches. The same ones, made the same way, every single day.

If it is on the board, it is good. If it is not on the board, we do not make it.',
   NULL, NULL, NULL,
   'textarea', 'manual');

-- Backfill hero fields on re-runs
UPDATE site_content SET
  hero_title         = 'Come hungry.',
  hero_subtitle      = 'Fresh-baked rolls. House-made spreads. One location, zero shortcuts.',
  hero_image_asset_id = 'media-demo-hero'
  WHERE id = 'sc-demo-home-hero';

UPDATE site_content SET
  hero_title         = 'One location. One kitchen.',
  hero_subtitle      = 'No shortcuts.',
  hero_image_asset_id = 'media-demo-story'
  WHERE id = 'sc-demo-story-intro';

-- ── AI credits (realistic balance for a demo account) ─────────────────────────
INSERT OR IGNORE INTO ai_credits (organization_id, balance, lifetime_used, last_topped_up_at)
VALUES ('org-demo', 500, 127, '2026-05-01T00:00:00.000Z');

-- ── Billing (free plan — shows correct plan badge in dashboard) ───────────────
INSERT OR IGNORE INTO organization_billing (id, organization_id, status, plan)
VALUES ('billing-demo', 'org-demo', 'free', 'free');
