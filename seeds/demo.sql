-- Demo seed for local development - Saya theme showcase
-- Preview at: http://demo.localhost:3000
-- Production at: https://demo.krabiclaw.com
-- Destructive for demo-owned rows: safe to re-run with yarn seed:local or yarn seed:remote --confirm-production

PRAGMA foreign_keys = ON;

-- Theme is shared platform data, not demo-owned data.
INSERT OR IGNORE INTO themes (id, name, slug, version, description, status)
VALUES ('saya-theme-v1', 'Saya', 'saya', '1.0.0', 'Restaurant website theme', 'active');

-- Cleanly replace the protected demo tenant. Cascades remove demo site content,
-- locations, media, menus, reviews, posts, translations, bookings, billing,
-- credits, ChowBot state, domains, and other demo-owned child rows.
DELETE FROM organization WHERE id IN ('org-demo', 'org_demo');
DELETE FROM user WHERE id IN ('user-demo', 'user_demo');

-- Guard against legacy demo scripts that may have claimed the demo domains.
DELETE FROM site_domains WHERE domain IN ('demo.localhost', 'demo.krabiclaw.com');

-- User
INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES ('user-demo', 'Demo Owner', 'demo@krabiclaw.com', 1, 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Organization
INSERT INTO organization (id, name, slug, createdAt)
VALUES ('org-demo', 'Ember & Slice', 'ember-slice-demo', CURRENT_TIMESTAMP);

INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES ('member-demo', 'org-demo', 'user-demo', 'owner', CURRENT_TIMESTAMP);

-- Site
INSERT INTO sites (
  id, organization_id, theme_id, theme, slug, subdomain,
  brand_name, brand_description,
  status, plan, onboarding_status, url_structure, primary_location_id,
  contact_email, default_currency
) VALUES (
  'site-demo', 'org-demo', 'saya-theme-v1', 'saya', 'ember-slice-demo', 'demo',
  'Ember & Slice',
  'A Brooklyn wood-fired trattoria serving blistered pies, seasonal antipasti, and easy neighborhood hospitality.',
  'active', 'free', 'active', 'location_subdirectories', NULL,
  'hello@emberandslice.example', 'USD'
);

-- Demo languages
INSERT INTO site_config (organization_id, site_id, key, value)
VALUES ('org-demo', 'site-demo', 'source_locale', 'en');

INSERT INTO site_locales
  (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled)
VALUES
  ('locale::org-demo::site-demo::en', 'org-demo', 'site-demo', 'en', 'English', 1, 'published', 1),
  ('locale::org-demo::site-demo::th', 'org-demo', 'site-demo', 'th', 'ไทย', 0, 'published', 1);

-- Site domains
INSERT INTO site_domains (id, organization_id, site_id, domain, type, role, status, dns_status)
VALUES
  ('domain-demo-local', 'org-demo', 'site-demo', 'demo.localhost', 'subdomain', 'secondary', 'active', 'valid'),
  ('domain-demo-prod', 'org-demo', 'site-demo', 'demo.krabiclaw.com', 'subdomain', 'canonical', 'active', 'valid');

-- Location
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
) VALUES (
  'loc-demo', 'org-demo', 'site-demo', 'brooklyn', 'Ember & Slice Brooklyn', 'Brooklyn',
  '{"addressLines":["184 Wythe Ave"],"locality":"Brooklyn","administrativeArea":"NY","postalCode":"11249","country":"US"}',
  '(718) 555-0148',
  'hello@emberandslice.example',
  'https://maps.app.goo.gl/ember-slice-brooklyn',
  40.7193, -73.9618,
  'A Brooklyn wood-fired trattoria built around blistered sourdough pies, bright antipasti, and an open oven that runs from lunch through late dinner.',
  'Wood-fired pizza, seasonal antipasti, and warm neighborhood hospitality in Brooklyn.',
  '[{"openDay":"MONDAY","openTime":"12:00","closeTime":"22:00"},{"openDay":"TUESDAY","openTime":"12:00","closeTime":"22:00"},{"openDay":"WEDNESDAY","openTime":"12:00","closeTime":"22:00"},{"openDay":"THURSDAY","openTime":"12:00","closeTime":"22:00"},{"openDay":"FRIDAY","openTime":"12:00","closeTime":"23:00"},{"openDay":"SATURDAY","openTime":"11:00","closeTime":"23:00"},{"openDay":"SUNDAY","openTime":"11:00","closeTime":"21:00"}]',
  4.8, 188,
  '$$',
  '["Pizza","Italian Restaurant","Wood-fired Trattoria"]',
  'https://instagram.com/emberandslice',
  'https://facebook.com/emberandslice',
  1, 'active'
), (
  'loc-demo-2', 'org-demo', 'site-demo', 'west-village', 'Ember & Slice West Village', 'New York',
  '{"addressLines":["100 7th Ave S"],"locality":"New York","administrativeArea":"NY","postalCode":"10014","country":"US"}',
  '(212) 555-0199',
  'hello@emberandslice.example',
  'https://maps.app.goo.gl/ember-slice-west-village',
  40.7335, -74.0027,
  'Our signature wood-fired pies and warm hospitality, brought to the heart of the West Village.',
  'Wood-fired pizza, seasonal antipasti, and neighborhood hospitality in the West Village.',
  '[{"openDay":"MONDAY","openTime":"16:00","closeTime":"23:00"},{"openDay":"TUESDAY","openTime":"16:00","closeTime":"23:00"},{"openDay":"WEDNESDAY","openTime":"16:00","closeTime":"23:00"},{"openDay":"THURSDAY","openTime":"16:00","closeTime":"23:00"},{"openDay":"FRIDAY","openTime":"15:00","closeTime":"23:59"},{"openDay":"SATURDAY","openTime":"15:00","closeTime":"23:59"},{"openDay":"SUNDAY","openTime":"15:00","closeTime":"23:00"}]',
  4.9, 112,
  '$$',
  '["Pizza","Italian Restaurant","Trattoria"]',
  'https://instagram.com/emberandslice',
  'https://facebook.com/emberandslice',
  0, 'active'
);

-- Set primary location after business_locations row exists
UPDATE sites SET primary_location_id = 'loc-demo' WHERE id = 'site-demo';

-- Media assets
INSERT INTO media_assets
  (id, organization_id, site_id, location_id,
   kind, provider, source,
   public_url, thumbnail_url,
   mime_type, file_name, alt_text, category, status)
VALUES
  ('media-demo-hero', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1579751626657-72bc17010498?w=1200&q=80',
   'https://images.unsplash.com/photo-1579751626657-72bc17010498?w=600&q=70',
   'image/jpeg', 'wood-fired-pizza-hero.jpg', 'Wood-fired pizza with blistered crust', 'food', 'active'),

  ('media-demo-hero-video', 'org-demo', 'site-demo', 'loc-demo',
   'video', 'external_url', 'external',
   '/videos/krabiclaw-demo-hero-video.mp4', NULL,
   'video/mp4', 'krabiclaw-demo-hero-video.mp4', 'Hero background video of the restaurant', 'interior', 'active'),

  ('media-demo-margherita-video', 'org-demo', 'site-demo', 'loc-demo',
   'video', 'external_url', 'external',
   '/videos/krabiclaw-demo-pizza-cutting.mp4', NULL,
   'video/mp4', 'krabiclaw-demo-pizza-cutting.mp4', 'Fresh Margherita pizza being cut', 'food', 'active'),
  
  ('media-demo-pizza-prep-video', 'org-demo', 'site-demo', 'loc-demo',
   'video', 'external_url', 'external',
   '/videos/krabiclaw-demo-pizza-prep.mp4', NULL,
   'video/mp4', 'krabiclaw-demo-pizza-prep.mp4', 'Pizza dough being prepared and wood-fired', 'interior', 'active'),

  ('media-demo-ext-1', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&q=80',
   'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=70',
   'image/jpeg', 'brooklyn-storefront.jpg', 'Neighborhood restaurant storefront', 'exterior', 'active'),
  ('media-demo-ext-2', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&q=80',
   'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600&q=70',
   'image/jpeg', 'evening-entrance.jpg', 'Warm trattoria entrance at night', 'exterior', 'active'),

  ('media-demo-int-1', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80',
   'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=70',
   'image/jpeg', 'dining-room.jpg', 'Cozy Brooklyn dining room', 'interior', 'active'),
  ('media-demo-int-2', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1200&q=80',
   'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=600&q=70',
   'image/jpeg', 'oven-counter.jpg', 'Open kitchen counter near the oven', 'interior', 'active'),
  ('media-demo-int-3', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80',
   'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=70',
   'image/jpeg', 'table-service.jpg', 'Table set for trattoria service', 'interior', 'active'),

  ('media-demo-team-1', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1581299894007-aaa50297cf16?w=1200&q=80',
   'https://images.unsplash.com/photo-1581299894007-aaa50297cf16?w=600&q=70',
   'image/jpeg', 'pizza-team.jpg', 'Ember & Slice kitchen team', 'team', 'active'),

  ('media-demo-margherita', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=900&q=80',
   'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=450&q=70',
   'image/jpeg', 'margherita.jpg', 'Margherita pizza with basil', 'food', 'active'),
  ('media-demo-pepperoni', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=900&q=80',
   'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=450&q=70',
   'image/jpeg', 'pepperoni-calabrese.jpg', 'Pepperoni Calabrese pizza', 'food', 'active'),
  ('media-demo-funghi', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1594007654729-407eedc4be65?w=900&q=80',
   'https://images.unsplash.com/photo-1594007654729-407eedc4be65?w=450&q=70',
   'image/jpeg', 'funghi-bianco.jpg', 'Mushroom white pizza', 'food', 'active'),
  ('media-demo-burrata', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=900&q=80',
   'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=450&q=70',
   'image/jpeg', 'burrata.jpg', 'Burrata with tomatoes and herbs', 'food', 'active'),
  ('media-demo-knots', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?w=900&q=80',
   'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?w=450&q=70',
   'image/jpeg', 'garlic-knots.jpg', 'Garlic knots with marinara', 'food', 'active'),

  ('media-demo-post1', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1579751626657-72bc17010498?w=1200&q=80',
   'https://images.unsplash.com/photo-1579751626657-72bc17010498?w=600&q=70',
   'image/jpeg', 'post-oven.jpg', 'Pizza coming out of the oven', 'food', 'active'),
  ('media-demo-post2', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80',
   'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=70',
   'image/jpeg', 'post-dining-room.jpg', 'Dining room during dinner service', 'interior', 'active'),
  ('media-demo-post3', 'org-demo', 'site-demo', 'loc-demo',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=1200&q=80',
   'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=600&q=70',
   'image/jpeg', 'post-margherita.jpg', 'Margherita pizza special', 'food', 'active'),
   
  ('media-demo2-hero', 'org-demo', 'site-demo', 'loc-demo-2',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1544148103-0773bf10d330?w=1200&q=80',
   'https://images.unsplash.com/photo-1544148103-0773bf10d330?w=600&q=70',
   'image/jpeg', 'west-village-hero.jpg', 'West Village restaurant storefront', 'exterior', 'active'),

  ('media-demo2-int-1', 'org-demo', 'site-demo', 'loc-demo-2',
   'image', 'external_url', 'external',
   'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200&q=80',
   'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&q=70',
   'image/jpeg', 'west-village-interior.jpg', 'Cozy West Village dining room', 'interior', 'active');

UPDATE business_locations SET hero_image_asset_id = 'media-demo-hero', hero_video_asset_id = 'media-demo-pizza-prep-video' WHERE id = 'loc-demo';
UPDATE business_locations SET hero_image_asset_id = 'media-demo2-hero' WHERE id = 'loc-demo-2';

-- Reviews
INSERT INTO reviews
  (id, organization_id, site_id, location_id,
   author_name, reviewer_photo_url, rating, content,
   owner_reply, owner_reply_at,
   status, source)
VALUES
  ('rev-demo-1', 'org-demo', 'site-demo', 'loc-demo',
   'Maya R.',
   'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&q=80',
   5,
   'The Margherita had that perfect leopard-spotted crust and the basil hit the table smelling fresh. Exactly what I want from a neighborhood pizza night.',
   NULL, NULL,
   'approved', 'google'),
  ('rev-demo-2', 'org-demo', 'site-demo', 'loc-demo',
   'Julian P.',
   'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&q=80',
   5,
   'Sat at the counter and watched the oven all night. Pepperoni Calabrese, burrata, and a spritz made this feel like a tiny vacation.',
   'Thank you Julian. The counter seats are our favorite too - come back for the Funghi Bianco next time.',
   '2026-04-22T09:15:00.000Z',
   'approved', 'google'),
  ('rev-demo-3', 'org-demo', 'site-demo', 'loc-demo',
   'Priya S.',
   'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&q=80',
   4,
   'Great crust, warm service, and the garlic knots vanished before the pizza landed. It gets loud at peak dinner but in a good way.',
   'Thanks Priya. Dinner definitely has energy, and we are glad the knots did their job.',
   '2026-04-15T11:30:00.000Z',
   'approved', 'google'),
  ('rev-demo-4', 'org-demo', 'site-demo', 'loc-demo',
   'Noah L.',
   'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&q=80',
   5,
   'The hot honey soppressata is ridiculous. Sweet, spicy, smoky, and somehow still balanced. Best pie I have had in Williamsburg this year.',
   NULL, NULL,
   'approved', 'google'),
  ('rev-demo-5', 'org-demo', 'site-demo', 'loc-demo',
   'Elena C.',
   'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=96&q=80',
   4,
   'Lovely date-night spot without feeling precious. Caesar was sharp and cold, pizza was blistered, staff knew the menu well.',
   NULL, NULL,
   'approved', 'google'),
  ('rev-demo-6', 'org-demo', 'site-demo', 'loc-demo',
   'Chris B.',
   'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=96&q=80',
   3,
   'Food was strong but our table was about 15 minutes late on a busy Friday. I would come earlier next time.',
   'Hi Chris - sorry for the Friday wait. We tightened our turn times and would love to host you again on a smoother night.',
   '2026-03-30T14:45:00.000Z',
   'approved', 'google'),
  ('rev-demo2-1', 'org-demo', 'site-demo', 'loc-demo-2',
   'Michael T.',
   'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&q=80',
   5,
   'Unbelievable sourdough pizza right in the West Village! The Margherita is simple, fresh, and perfectly charred. Truly a hidden gem.',
   'Thank you Michael! We are thrilled you enjoyed the neighborhood vibes and our signature crust.',
   '2026-05-15T12:00:00.000Z',
   'approved', 'google'),
  ('rev-demo2-2', 'org-demo', 'site-demo', 'loc-demo-2',
   'Emma W.',
   'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&q=80',
   5,
   'Beautiful space, exceptionally friendly service, and a fantastic corner view. Highly recommend the Burrata and the Hot Honey pie!',
   NULL, NULL,
   'approved', 'google');

-- Menu
INSERT INTO menus (id, organization_id, site_id, location_id, name, description, section_order, status)
VALUES (
  'menu-demo', 'org-demo', 'site-demo', 'loc-demo', 'Menu',
  'Wood-fired pizza, antipasti, salads, and drinks from the Ember & Slice oven.',
  '["Wood-Fired Pizza","Antipasti","Pasta & Salads","Drinks"]',
  'published'
), (
  'menu-demo-2', 'org-demo', 'site-demo', 'loc-demo-2', 'Menu',
  'Wood-fired pizza, fresh local antipasti, and craft drinks in the West Village.',
  '["Wood-Fired Pizza","Antipasti","Drinks"]',
  'published'
);

INSERT INTO menu_items
  (id, menu_id, section, name, slug, description, price_amount,
   image_asset_id, allergens, dietary_notes, available, sort_order)
VALUES
  ('mi-1', 'menu-demo', 'Wood-Fired Pizza', 'Margherita', 'margherita',
   'San Marzano tomato, fior di latte, basil, extra virgin olive oil, sea salt',
   18, 'media-demo-margherita', 'Gluten, Dairy', 'Vegetarian', 1, 1),
  ('mi-2', 'menu-demo', 'Wood-Fired Pizza', 'Pepperoni Calabrese', 'pepperoni-calabrese',
   'Tomato, mozzarella, cupping pepperoni, Calabrian chile, oregano',
   21, 'media-demo-pepperoni', 'Gluten, Dairy', NULL, 1, 2),
  ('mi-3', 'menu-demo', 'Wood-Fired Pizza', 'Funghi Bianco', 'funghi-bianco',
   'Roasted mushrooms, ricotta crema, garlic, thyme, mozzarella, pecorino',
   22, 'media-demo-funghi', 'Gluten, Dairy', 'Vegetarian', 1, 3),
  ('mi-4', 'menu-demo', 'Wood-Fired Pizza', 'Soppressata Hot Honey', 'soppressata-hot-honey',
   'Spicy soppressata, tomato, mozzarella, pickled Fresno chile, Brooklyn hot honey',
   23, NULL, 'Gluten, Dairy', NULL, 1, 4),
  ('mi-5', 'menu-demo', 'Antipasti', 'Burrata', 'burrata',
   'Creamy burrata, roasted cherry tomatoes, basil oil, grilled sourdough',
   16, 'media-demo-burrata', 'Gluten, Dairy', 'Vegetarian', 1, 1),
  ('mi-6', 'menu-demo', 'Antipasti', 'Garlic Knots', 'garlic-knots',
   'Wood-fired knots, parsley, roasted garlic butter, marinara',
   9, 'media-demo-knots', 'Gluten, Dairy', 'Vegetarian', 1, 2),
  ('mi-7', 'menu-demo', 'Pasta & Salads', 'Little Gem Caesar', 'little-gem-caesar',
   'Little gem lettuce, anchovy dressing, sourdough crumbs, shaved pecorino',
   14, NULL, 'Gluten, Dairy, Fish', NULL, 1, 1),
  ('mi-8', 'menu-demo', 'Pasta & Salads', 'Rigatoni Pomodoro', 'rigatoni-pomodoro',
   'Rigatoni, slow tomato sauce, basil, parmesan',
   19, NULL, 'Gluten, Dairy', 'Vegetarian', 1, 2),
  ('mi-9', 'menu-demo', 'Drinks', 'Sparkling Lemonade', 'sparkling-lemonade',
   'House lemon cordial, soda, rosemary',
   6, NULL, NULL, 'Vegan, Gluten-free', 1, 1),
  ('mi-10', 'menu-demo', 'Drinks', 'Italian Soda', 'italian-soda',
   'Blood orange, grapefruit, or limonata',
   5, NULL, NULL, 'Vegan, Gluten-free', 1, 2),
  ('mi-demo2-1', 'menu-demo-2', 'Wood-Fired Pizza', 'Margherita', 'margherita',
   'San Marzano tomato, fior di latte, basil, extra virgin olive oil, sea salt',
   18, 'media-demo-margherita', 'Gluten, Dairy', 'Vegetarian', 1, 1),
  ('mi-demo2-2', 'menu-demo-2', 'Wood-Fired Pizza', 'Pepperoni Calabrese', 'pepperoni-calabrese',
   'Tomato, mozzarella, cupping pepperoni, Calabrian chile, oregano',
   21, 'media-demo-pepperoni', 'Gluten, Dairy', NULL, 1, 2),
  ('mi-demo2-3', 'menu-demo-2', 'Antipasti', 'Burrata', 'burrata',
   'Creamy burrata, roasted cherry tomatoes, basil oil, grilled sourdough',
   16, 'media-demo-burrata', 'Gluten, Dairy', 'Vegetarian', 1, 1),
  ('mi-demo2-4', 'menu-demo-2', 'Drinks', 'Sparkling Lemonade', 'sparkling-lemonade',
   'House lemon cordial, soda, rosemary',
   6, NULL, NULL, 'Vegan, Gluten-free', 1, 1);

-- Location Q&A
INSERT INTO location_qa
  (id, organization_id, site_id, location_id,
   question, question_author, answer, answer_author,
   is_owner_answer, upvote_count, source, status, sort_order)
VALUES
  ('qa-demo-1', 'org-demo', 'site-demo', 'loc-demo',
   'Do you take reservations?', 'A Guest',
   'Yes. We hold room for walk-ins, but reservations are recommended for dinner and weekends.',
   'Ember & Slice Brooklyn', 1, 14, 'manual', 'published', 1),
  ('qa-demo2-1', 'org-demo', 'site-demo', 'loc-demo-2',
   'Do you offer outdoor seating?', 'Outdoor Diner',
   'Absolutely! We have a lovely patio setup for the warmer months.',
   'Ember & Slice West Village', 1, 8, 'manual', 'published', 1),
  ('qa-demo2-2', 'org-demo', 'site-demo', 'loc-demo-2',
   'Do you offer gluten-free crust?', 'Coeliac Foodie',
   'Yes, we offer gluten-free crust for any of our wood-fired pizzas for an additional charge.',
   'Ember & Slice West Village', 1, 5, 'manual', 'published', 2),
  ('qa-demo-2', 'org-demo', 'site-demo', 'loc-demo',
   'Do you offer gluten-free crust?', 'Another Guest',
   'Not yet. Our dough room uses wheat flour all day, so we cannot safely guarantee a gluten-free crust.',
   'Ember & Slice Brooklyn', 1, 8, 'manual', 'published', 2),
  ('qa-demo-3', 'org-demo', 'site-demo', 'loc-demo',
   'Can I order takeout?', 'A Guest',
   'Yes. Call us directly for pickup. Wood-fired pies travel best when picked up close to oven time.',
   'Ember & Slice Brooklyn', 1, 11, 'manual', 'published', 3),
  ('qa-demo-4', 'org-demo', 'site-demo', 'loc-demo',
   'What are your busiest times?', 'A Guest',
   'Friday and Saturday from 7pm to 9pm are peak. Earlier dinner or Sunday lunch is calmer.',
   'Ember & Slice Brooklyn', 1, 6, 'manual', 'published', 4),
  ('qa-demo-5', 'org-demo', 'site-demo', 'loc-demo',
   'Do you have vegetarian options?', 'A Guest',
   'Absolutely. Margherita, Funghi Bianco, Burrata, Garlic Knots, and Rigatoni Pomodoro are vegetarian.',
   'Ember & Slice Brooklyn', 1, 5, 'manual', 'published', 5);

-- Posts
INSERT INTO posts
  (id, organization_id, site_id, location_id,
   post_type, title, body, image_asset_id,
   status, published_at, created_by)
VALUES
  ('post-demo-1', 'org-demo', 'site-demo', 'loc-demo',
   'update', 'Weekend lunch now starts at 11',
   'The oven is lighting up earlier on Saturdays and Sundays. Come by for lunch pies, garlic knots, and spritzes from 11am.',
   'media-demo-post1', 'published', '2026-05-01T12:00:00.000Z', 'user-demo'),
  ('post-demo-2', 'org-demo', 'site-demo', 'loc-demo',
   'standard', NULL,
   'Our Funghi Bianco is back with roasted mushrooms, ricotta crema, thyme, and a little pecorino snow at the pass.',
   'media-demo-post2', 'published', '2026-04-18T10:00:00.000Z', 'user-demo'),
  ('post-demo-3', 'org-demo', 'site-demo', 'loc-demo',
   'offer', 'Margherita Monday',
   'Every Monday in May: Margherita pies are $14 from open to close. Dine-in only, one per guest.',
   'media-demo-post3', 'published', '2026-04-10T09:00:00.000Z', 'user-demo');

INSERT INTO post_channel_jobs (id, post_id, organization_id, channel, status, published_at)
VALUES
  ('pcj-demo-1', 'post-demo-1', 'org-demo', 'site', 'published', '2026-05-01T12:00:00.000Z'),
  ('pcj-demo-2', 'post-demo-2', 'org-demo', 'site', 'published', '2026-04-18T10:00:00.000Z'),
  ('pcj-demo-3', 'post-demo-3', 'org-demo', 'site', 'published', '2026-04-10T09:00:00.000Z');

-- Site content
INSERT INTO site_content
  (id, organization_id, site_id, location_id,
   page, field, content, hero_title, hero_subtitle, hero_image_asset_id,
   type, source)
VALUES
  ('sc-demo-home-hero', 'org-demo', 'site-demo', NULL,
   'home', 'hero', NULL,
   'Wood fire. Brooklyn nights.',
   'Blistered pies & warm neighborhood vibes.',
   'media-demo-hero',
   'text', 'manual'),
  ('sc-demo-cta', 'org-demo', 'site-demo', NULL,
   'home', 'cta.title', 'Book a table near the oven.', NULL, NULL, NULL,
   'text', 'manual'),
  ('sc-demo-story-image', 'org-demo', 'site-demo', NULL,
   'about', 'story.image',
   'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1400&q=85',
   NULL, NULL, NULL,
   'media', 'manual'),
  ('sc-demo-story-title', 'org-demo', 'site-demo', NULL,
   'about', 'story.title',
   'A trattoria shaped by the oven.',
   NULL, NULL, NULL,
   'text', 'manual'),
  ('sc-demo-story-body', 'org-demo', 'site-demo', NULL,
   'about', 'story.body',
   'Ember & Slice started with a sourdough starter, a borrowed mixer, and a pop-up oven behind a Brooklyn wine bar. The pies sold out before sunset, then again the next weekend, and then every weekend after that.

Today the room is permanent, but the promise is the same: slow dough, live fire, seasonal produce, and the kind of service that makes a weeknight feel like an occasion.',
   NULL, NULL, NULL,
   'richtext', 'manual'),
  ('sc-demo-journey', 'org-demo', 'site-demo', NULL,
   'about', 'journey.body',
   'We cold-ferment our dough, stretch every pie to order, and cook it hot enough for a crisp rim and a tender center. The menu changes around the market, but the Margherita never leaves the board.

The oven anchors the room. Everything else moves around it.',
   NULL, NULL, NULL,
   'textarea', 'manual'),
  ('sc-demo-experience', 'org-demo', 'site-demo', NULL,
   'about', 'experience.body',
   'Come for a quick counter pie, stay for antipasti and another round, or bring a group and let the table fill itself. Ember & Slice is casual by design, but the details matter.

Good tomatoes. Good flour. Good fire. No shortcuts.',
   NULL, NULL, NULL,
   'textarea', 'manual');

UPDATE site_content SET hero_video_asset_id = 'media-demo-hero-video' WHERE id = 'sc-demo-home-hero';

-- Thai demo translations
INSERT INTO site_content_translations
  (id, organization_id, site_id, location_id, locale, page, field, content, hero_title, hero_subtitle, value, type, status, source_hash, translated_at, reviewed_at)
VALUES
  ('sct-demo-th-home-hero', 'org-demo', 'site-demo', NULL, 'th', 'home', 'hero',
   NULL, 'ไฟฟืนและค่ำคืนในบรูคลิน', 'พิซซ่าแป้งซาวโดว์ขอบพองกรอบ แอนติพาสติตามฤดูกาล และห้องอาหารที่อบอุ่นด้วยแสงจากเตา', 'ไฟฟืนและค่ำคืนในบรูคลิน', 'text', 'published',
   'demo-pizza-home-hero-v1', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('sct-demo-th-cta', 'org-demo', 'site-demo', NULL, 'th', 'home', 'cta.title',
   'จองโต๊ะใกล้เตาอบ', NULL, NULL, 'จองโต๊ะใกล้เตาอบ', 'text', 'published',
   'demo-pizza-cta-v1', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('sct-demo-th-story-title', 'org-demo', 'site-demo', NULL, 'th', 'about', 'story.title',
   'แทรตโทเรียที่มีเตาอบเป็นหัวใจ', NULL, NULL, 'แทรตโทเรียที่มีเตาอบเป็นหัวใจ', 'text', 'published',
   'demo-pizza-story-title-v1', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('sct-demo-th-story-body', 'org-demo', 'site-demo', NULL, 'th', 'about', 'story.body',
   'Ember & Slice เริ่มจากแป้งซาวโดว์ เครื่องผสมที่ยืมมา และเตาอบป๊อปอัพหลังบาร์ไวน์แห่งหนึ่งในบรูคลิน พิซซ่าขายหมดก่อนพระอาทิตย์ตก แล้วก็ขายหมดอีกในสุดสัปดาห์ถัดมา และทุกสุดสัปดาห์หลังจากนั้น\n\nวันนี้ร้านมีที่อยู่ถาวรแล้ว แต่คำสัญญายังเหมือนเดิม: แป้งที่ใช้เวลา ไฟจริง วัตถุดิบตามฤดูกาล และการบริการที่ทำให้คืนธรรมดารู้สึกพิเศษ',
   NULL, NULL,
   'Ember & Slice เริ่มจากแป้งซาวโดว์ เครื่องผสมที่ยืมมา และเตาอบป๊อปอัพหลังบาร์ไวน์แห่งหนึ่งในบรูคลิน',
   'richtext', 'published', 'demo-pizza-story-body-v1',
   '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

INSERT INTO business_location_translations
  (id, organization_id, site_id, location_id, locale, title, address, city, description, short_description, status, source_hash, translated_at, reviewed_at)
VALUES
  ('blt-demo-th-loc', 'org-demo', 'site-demo', 'loc-demo', 'th',
   'Ember & Slice บรูคลิน', '184 Wythe Ave', 'บรูคลิน',
   'แทรตโทเรียพิซซ่าเตาฟืนในบรูคลิน เสิร์ฟพิซซ่าแป้งซาวโดว์ แอนติพาสติตามฤดูกาล และบรรยากาศอบอุ่นรอบเตาอบ',
   'พิซซ่าเตาฟืน แอนติพาสติตามฤดูกาล และการต้อนรับแบบเพื่อนบ้านในบรูคลิน',
   'published', 'demo-pizza-location-v1',
   '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

INSERT INTO menu_translations
  (id, organization_id, site_id, menu_id, locale, name, description, section_order, status, source_hash, translated_at, reviewed_at)
VALUES
  ('mt-demo-th-menu', 'org-demo', 'site-demo', 'menu-demo', 'th', 'เมนู', 'พิซซ่าเตาฟืน แอนติพาสตี สลัด และเครื่องดื่มจาก Ember & Slice',
   '["พิซซ่าเตาฟืน","แอนติพาสตี","พาสต้าและสลัด","เครื่องดื่ม"]',
   'published', 'demo-pizza-menu-v1',
   '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

INSERT INTO menu_item_translations
  (id, organization_id, site_id, menu_item_id, locale, section, name, description, allergens, dietary_notes, status, source_hash, translated_at, reviewed_at)
VALUES
  ('mit-demo-th-mi-1', 'org-demo', 'site-demo', 'mi-1', 'th', 'พิซซ่าเตาฟืน', 'มาร์เกริตา',
   'มะเขือเทศซานมาร์ซาโน ฟิออร์ดิลาเต้ ใบโหระพา น้ำมันมะกอกเอ็กซ์ตร้าเวอร์จิน และเกลือทะเล',
   'กลูเตน, นม', 'มังสวิรัติ', 'published', 'demo-pizza-mi-1-v1',
   '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('mit-demo-th-mi-2', 'org-demo', 'site-demo', 'mi-2', 'th', 'พิซซ่าเตาฟืน', 'เปปเปอโรนีคาลาเบรเซ',
   'ซอสมะเขือเทศ มอซซาเรลลา เปปเปอโรนี พริกคาลาเบรีย และออริกาโน',
   'กลูเตน, นม', NULL, 'published', 'demo-pizza-mi-2-v1',
   '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('mit-demo-th-mi-3', 'org-demo', 'site-demo', 'mi-3', 'th', 'พิซซ่าเตาฟืน', 'ฟุงกีบิอังโก',
   'เห็ดย่าง ครีมริคอตตา กระเทียม ไทม์ มอซซาเรลลา และเปโคริโน',
   'กลูเตน, นม', 'มังสวิรัติ', 'published', 'demo-pizza-mi-3-v1',
   '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('mit-demo-th-mi-5', 'org-demo', 'site-demo', 'mi-5', 'th', 'แอนติพาสตี', 'บูราตา',
   'บูราตาครีมมี่ มะเขือเทศเชอร์รีย่าง น้ำมันโหระพา และซาวโดว์ย่าง',
   'กลูเตน, นม', 'มังสวิรัติ', 'published', 'demo-pizza-mi-5-v1',
   '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('mit-demo-th-mi-6', 'org-demo', 'site-demo', 'mi-6', 'th', 'แอนติพาสตี', 'การ์ลิกนอตส์',
   'ขนมปังนอตส์อบเตาฟืน คลุกพาร์สลีย์ เนยกระเทียมย่าง และมารินารา',
   'กลูเตน, นม', 'มังสวิรัติ', 'published', 'demo-pizza-mi-6-v1',
   '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

-- AI credits
INSERT INTO ai_credits (organization_id, balance, lifetime_used, last_topped_up_at)
VALUES ('org-demo', 500, 127, '2026-05-01T00:00:00.000Z');

-- Billing
INSERT INTO organization_billing (id, organization_id, status, plan)
VALUES ('billing-demo', 'org-demo', 'free', 'free');
