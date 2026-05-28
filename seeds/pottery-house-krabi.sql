-- Pottery House Krabi seed
-- Preview at: http://pottery-house.localhost:3000
-- Production at: https://pottery-house.krabiclaw.com
-- Destructive for pottery-house-owned rows: safe to re-run with yarn seed:local or yarn seed:remote --confirm-production

PRAGMA foreign_keys = ON;

-- Theme is shared platform data, not client-owned.
INSERT OR IGNORE INTO themes (id, name, slug, version, description, status)
VALUES ('saya-theme-v1', 'Saya', 'saya', '1.0.0', 'Restaurant website theme', 'active');

-- Clean replace (disabling foreign keys during setup prevents cascading delete/lock issues with some tables)
PRAGMA foreign_keys = OFF;
DELETE FROM organization WHERE id = 'org-pottery-house';
DELETE FROM site_domains WHERE domain IN ('pottery-house.localhost', 'pottery-house.krabiclaw.com');
PRAGMA foreign_keys = ON;

-- Organization (owned by your existing platform admin account)
INSERT INTO organization (id, name, slug, createdAt)
VALUES ('org-pottery-house', 'Pottery House Krabi', 'pottery-house-krabi', CURRENT_TIMESTAMP);

-- Ensure the owner user exists in the user table to satisfy foreign key constraints.
-- For local D1, we insert the user-pottery-house user.
-- For remote production, the owner account is IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO. We ensure BOTH users exist.
INSERT OR IGNORE INTO user (id, name, email, emailVerified)
VALUES 
  ('user-pottery-house', 'Pottery House Owner', 'bamboo.chow@gmail.com', 1),
  ('IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO', 'Platform Admin', 'paulchrisluke@gmail.com', 1);

INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES 
  ('member-pottery-house', 'org-pottery-house', 
   CASE WHEN EXISTS(SELECT 1 FROM user WHERE id = 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO') 
        THEN 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO' 
        ELSE 'user-pottery-house' 
   END, 
   'owner', CURRENT_TIMESTAMP);

-- Site
INSERT INTO sites (
  id, organization_id, theme_id, theme, slug, subdomain,
  brand_name, brand_description,
  status, plan, onboarding_status, url_structure, primary_location_id,
  contact_email, default_currency
) VALUES (
  'site-pottery-house', 'org-pottery-house', 'saya-theme-v1', 'saya', 'pottery-house-krabi', 'pottery-house',
  'Pottery House Krabi',
  'A creative pottery studio in Krabi, Thailand. Wheel throwing classes, handbuilding workshops, Cocktails & Clay nights, and a beachfront popup. Clay, calm, and a place to return to each week.',
  'active', 'free', 'active', 'location_subdirectories', NULL,
  'bamboo.chow@gmail.com', 'THB'
);

-- Languages
INSERT INTO site_config (organization_id, site_id, key, value)
VALUES ('org-pottery-house', 'site-pottery-house', 'source_locale', 'en');

INSERT INTO site_locales
  (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled)
VALUES
  ('locale::org-pottery-house::site-pottery-house::en', 'org-pottery-house', 'site-pottery-house', 'en', 'English', 1, 'published', 1),
  ('locale::org-pottery-house::site-pottery-house::th', 'org-pottery-house', 'site-pottery-house', 'th', 'ไทย', 0, 'published', 1);

-- Domains
INSERT INTO site_domains (id, organization_id, site_id, domain, type, role, status, dns_status)
VALUES
  ('domain-pottery-local', 'org-pottery-house', 'site-pottery-house', 'pottery-house.localhost', 'subdomain', 'secondary', 'active', 'valid'),
  ('domain-pottery-prod', 'org-pottery-house', 'site-pottery-house', 'pottery-house.krabiclaw.com', 'subdomain', 'canonical', 'active', 'valid');

-- Location: main studio in Krabi town
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
  'loc-pottery-house', 'org-pottery-house', 'site-pottery-house', 'krabi', 'Pottery House Krabi', 'Krabi',
  '{"addressLines":[""],"locality":"Krabi","administrativeArea":"Krabi","postalCode":"81000","country":"TH"}',
  NULL,
  'bamboo.chow@gmail.com',
  'https://maps.app.goo.gl/pottery-house-krabi',
  8.0557285, 98.7504791,
  'Pottery House is a creative studio in Krabi where you can throw on the wheel, build by hand, glaze your pieces, and take something real home with you. All materials and firing are included. Whether you are a first-timer, a returning traveller, or someone looking for a slow creative routine while staying in Krabi, you are welcome here.',
  'Wheel throwing, handbuilding, and glazing classes in the heart of Krabi. All materials and firing included.',
  '[{"openDay":"TUESDAY","openTime":"10:00","closeTime":"18:00"},{"openDay":"WEDNESDAY","openTime":"10:00","closeTime":"18:00"},{"openDay":"THURSDAY","openTime":"10:00","closeTime":"18:00"},{"openDay":"FRIDAY","openTime":"10:00","closeTime":"22:00"},{"openDay":"SATURDAY","openTime":"10:00","closeTime":"18:00"},{"openDay":"SUNDAY","openTime":"10:00","closeTime":"18:00"}]',
  4.9, 74,
  '฿฿',
  '["Pottery Studio","Pottery Classes","Ceramic Workshop","Art Experience"]',
  'https://instagram.com/potteryclasseskrabi',
  NULL,
  1, 'active'
), (
  'loc-pottery-beachfront', 'org-pottery-house', 'site-pottery-house', 'klong-muang-beach', 'Pottery House — Beachfront at Klong Muang', 'Krabi',
  '{"addressLines":["Sea View, Klong Muang"],"locality":"Krabi","administrativeArea":"Krabi","postalCode":"81000","country":"TH"}',
  NULL,
  'bamboo.chow@gmail.com',
  'https://maps.app.goo.gl/pottery-house-klong-muang',
  8.1180, 98.7720,
  'A pop-up beachfront pottery session at Sea View, Klong Muang. Throw on the wheel with the Gulf of Thailand in front of you. Limited seats, unforgettable setting.',
  'Beachfront wheel throwing sessions at Klong Muang beach. Limited seats.',
  '[]',
  4.9, 18,
  '฿฿',
  '["Pottery Studio","Beachfront Experience","Pottery Classes"]',
  'https://instagram.com/potteryclasseskrabi',
  NULL,
  0, 'active'
);

-- Set primary location
UPDATE sites SET primary_location_id = 'loc-pottery-house' WHERE id = 'site-pottery-house';

-- Media assets (using actual client images from the new-client folder)
INSERT INTO media_assets
  (id, organization_id, site_id, location_id,
   kind, provider, source,
   public_url, thumbnail_url,
   mime_type, file_name, alt_text, category, status)
VALUES
  -- Hero: studio exterior with Pottery House sign and hanging greenery
  ('media-ph-hero', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'image', 'external_url', 'external',
   '/images/pottery-house/705340249_1010726131467629_3263381692626801997_n.png',
   '/images/pottery-house/705340249_1010726131467629_3263381692626801997_n.png',
   'image/png', 'pottery-house-hero.png', 'Pottery House Krabi studio exterior with hanging greenery and warm lights', 'exterior', 'active'),

  -- Studio interior: dark walls, hanging plants, shelves of pottery
  ('media-ph-studio', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'image', 'external_url', 'external',
   '/images/pottery-house/702076535_1536875324669582_6858683140635045482_n.jpg',
   '/images/pottery-house/702076535_1536875324669582_6858683140635045482_n.jpg',
   'image/jpeg', 'pottery-house-studio.jpg', 'Pottery House Krabi studio with dark walls, hanging greenery and shelves of handmade ceramics', 'interior', 'active'),

  -- Team: the two founders holding clay
  ('media-ph-team', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'image', 'external_url', 'external',
   '/images/pottery-house/705001439_1023555783578064_2057760163234352028_n.jpg',
   '/images/pottery-house/705001439_1023555783578064_2057760163234352028_n.jpg',
   'image/jpeg', 'pottery-house-team.jpg', 'Pottery House Krabi team with handmade pottery on shelves behind them', 'team', 'active'),

  -- Wheel class image
  ('media-ph-wheel', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'image', 'external_url', 'external',
   '/images/pottery-house/WhatsApp Image 2026-05-28 at 08.11.53.jpeg',
   '/images/pottery-house/WhatsApp Image 2026-05-28 at 08.11.53.jpeg',
   'image/jpeg', 'pottery-wheel-class.jpg', 'Pottery wheel throwing class at Pottery House Krabi', 'interior', 'active'),

  -- Finished ceramics on display
  ('media-ph-ceramics', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'image', 'external_url', 'external',
   '/images/pottery-house/701881199_1297931665853512_4498860250475437214_n.jpg',
   '/images/pottery-house/701881199_1297931665853512_4498860250475437214_n.jpg',
   'image/jpeg', 'pottery-ceramics-display.jpg', 'Display of handmade ceramics, cups, plates and vases at Pottery House Krabi', 'food', 'active'),

  -- Kiln / firing
  ('media-ph-kiln', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'image', 'external_url', 'external',
   '/images/pottery-house/685364691_26612713248421573_8612762676974548589_n.jpg',
   '/images/pottery-house/685364691_26612713248421573_8612762676974548589_n.jpg',
   'image/jpeg', 'pottery-kiln.jpg', 'Professional kiln at Pottery House Krabi for bisque and glaze firing', 'interior', 'active'),

  -- Cocktails & Clay promo
  ('media-ph-cocktails-clay', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'image', 'external_url', 'external',
   '/images/pottery-house/553069773_1513411773229740_6966074185346464833_n.jpg',
   '/images/pottery-house/553069773_1513411773229740_6966074185346464833_n.jpg',
   'image/jpeg', 'cocktails-and-clay.jpg', 'Cocktails and Clay Friday night event at Pottery House Krabi', 'interior', 'active'),

  -- Beachfront location
  ('media-ph-beach', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-beachfront',
   'image', 'external_url', 'external',
   '/images/pottery-house/WhatsApp Image 2026-05-28 at 08.11.54.jpeg',
   '/images/pottery-house/WhatsApp Image 2026-05-28 at 08.11.54.jpeg',
   'image/jpeg', 'klong-muang-beachfront.jpg', 'Beachfront pottery session at Klong Muang with Gulf of Thailand view', 'exterior', 'active'),

  -- Post images
  ('media-ph-post1', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'image', 'external_url', 'external',
   '/images/pottery-house/WhatsApp Image 2026-05-28 at 08.17.57.jpeg',
   '/images/pottery-house/WhatsApp Image 2026-05-28 at 08.17.57.jpeg',
   'image/jpeg', 'post-wheel.jpg', 'Pottery wheel class at Pottery House Krabi', 'interior', 'active'),
  ('media-ph-post2', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'image', 'external_url', 'external',
   '/images/pottery-house/WhatsApp Image 2026-05-28 at 08.12.48.jpeg',
   '/images/pottery-house/WhatsApp Image 2026-05-28 at 08.12.48.jpeg',
   'image/jpeg', 'post-team.jpg', 'Pottery House Krabi team', 'team', 'active'),
  ('media-ph-post3', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'image', 'external_url', 'external',
   '/images/pottery-house/WhatsApp Image 2026-05-28 at 08.12.15.jpeg',
   '/images/pottery-house/WhatsApp Image 2026-05-28 at 08.12.15.jpeg',
   'image/jpeg', 'post-cocktails.jpg', 'Cocktails and Clay Friday event', 'interior', 'active');

-- Set hero images
UPDATE business_locations SET hero_image_asset_id = 'media-ph-hero' WHERE id = 'loc-pottery-house';
UPDATE business_locations SET hero_image_asset_id = 'media-ph-beach' WHERE id = 'loc-pottery-beachfront';

-- Experiences (no menu — this is an experience-only site)
INSERT INTO experiences
  (id, organization_id, site_id, location_id,
   title, slug, tagline, body,
   image_asset_id, price, duration_minutes, max_capacity,
   time_slots, available_note,
   status, sort_order,
   seo_title, seo_description)
VALUES
  -- 1. Pottery Wheel Class (flagship)
  ('exp-ph-wheel', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'Pottery Wheel Class', 'pottery-wheel-class',
   'Shape something beautiful. All levels welcome.',
   'Our signature wheel throwing class is perfect for beginners and returning students alike. You will learn to centre clay, open and pull a cylinder, and shape your piece with guidance from our instructors every step of the way.

All clay, tools, and firing are included. Your finished pieces are bisque-fired and glaze-fired in our kiln and ready to collect approximately 2–3 weeks after your class.

What to expect:
- 1 hour 30 minutes of hands-on wheel time
- All materials included (clay, tools, apron)
- Bisque firing and glaze firing included
- Studio glazes available to choose from
- Pieces ready to collect in 2–3 weeks (or shipped home)',
   'media-ph-wheel',
   '฿1,200', 90, 8,
   '["10:00","12:00","14:00","16:00"]',
   'Book online or message us on Instagram @potteryclasseskrabi',
   'active', 1,
   'Pottery Wheel Class Krabi — Pottery House',
   'Join a pottery wheel throwing class at Pottery House Krabi. All materials and firing included. Perfect for beginners and returning students in Krabi, Thailand.'),

  -- 2. Cocktails & Clay (Friday night event)
  ('exp-ph-cocktails', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'Cocktails & Clay', 'cocktails-and-clay',
   'Friday nights. Wheels spinning. Drinks flowing.',
   'Cocktails & Clay is our Friday night social — a relaxed and fun way to try pottery with friends while enjoying a drink or two.

You get a full wheel throwing session with instructor support, and we take care of the good vibes. Bisque and glaze firing are included, so your creation gets the full kiln treatment just like in any daytime class.

Perfect for couples, groups, date nights, and solo travellers looking for a fun evening out in Krabi.

What is included:
- 3 hours of wheel time and handbuilding
- Drinks available at the studio
- All clay, aprons, and tools provided
- Bisque firing and glaze firing included
- Pieces ready in 2–3 weeks',
   'media-ph-cocktails-clay',
   '฿1,500', 180, 12,
   '["19:00"]',
   'Every Friday, 7PM to 10PM. Book in advance as spots fill quickly.',
   'active', 2,
   'Cocktails & Clay Friday Night — Pottery House Krabi',
   'Cocktails & Clay every Friday 7PM–10PM at Pottery House Krabi. A social pottery evening with drinks, wheels, and good company.'),

  -- 3. Beachfront Pottery (popup)
  ('exp-ph-beachfront', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-beachfront',
   'Beachfront Pottery', 'beachfront-pottery',
   'Throw on the wheel with the sea in front of you.',
   'Our beachfront pottery popup at Sea View, Klong Muang is one of a kind. We set up the wheels right by the Gulf of Thailand so you can shape clay while watching long-tail boats drift past.

Seats are extremely limited at this location. Each session is an intimate, unhurried experience guided by our instructor.

All materials and firing included — your piece travels back to the studio kiln and is ready to collect or ship within 2–3 weeks.

Good for:
- Hotel guests staying in Klong Muang or Tubkaek
- Couples looking for a unique Krabi experience
- Anyone who wants to make something by the sea',
   'media-ph-beach',
   '฿1,800', 120, 4,
   '["09:00","15:00"]',
   'Available on selected days. Message us on Instagram @potteryclasseskrabi to check availability.',
   'active', 3,
   'Beachfront Pottery Class Klong Muang Krabi — Pottery House',
   'A unique beachfront pottery experience at Klong Muang beach, Krabi. Limited seats. Wheel throwing with a Gulf of Thailand view. All materials and firing included.'),

  -- 4. Monthly Membership
  ('exp-ph-membership', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'Monthly Studio Membership', 'monthly-membership',
   'Make Pottery House your creative base while you are in Krabi.',
   'For people staying in Krabi for a month or more, Pottery House can become more than a class. It can become your creative base — a place to practise, meet people, return to unfinished pieces, and feel part of the studio community.

Membership is designed for long-stay visitors, remote workers, expats, and returning guests who want access to the studio beyond a single tourist class.

What membership includes:
- Studio access during agreed member hours
- Space for handbuilding, practice, and quiet studio time
- Access to shared tools, work tables, and clay support from the team
- Storage for works-in-progress while pieces dry and move through firing
- Clay included (reasonable monthly allowance)
- Bisque and glaze firing included
- Studio glazes available (member palette)
- A chance to meet other makers and feel part of the Pottery House rhythm

Ask us about current member hours, firing schedule, and monthly pricing.',
   'media-ph-studio',
   'Ask us', NULL, NULL,
   NULL,
   'Contact us on Instagram @potteryclasseskrabi or email hello@potteryhoueskrabi.com to discuss membership.',
   'active', 4,
   'Monthly Pottery Studio Membership Krabi — Pottery House',
   'Monthly pottery studio membership at Pottery House Krabi. For long-stay visitors, expats, and remote workers. Studio access, tools, storage, and firing included.');

-- Reviews
INSERT INTO reviews
  (id, organization_id, site_id, location_id,
   author_name, reviewer_photo_url, rating, content,
   owner_reply, owner_reply_at,
   status, source)
VALUES
  ('rev-ph-1', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'Sophie L.',
   'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&q=80',
   5,
   'Absolutely loved my wheel class here. The instructor was patient and encouraging — I managed to make an actual bowl on my first try. The studio has such a great vibe, dark walls covered in plants and shelves of beautiful pottery. Already booked my next session.',
   'Thank you Sophie! See you at the wheel soon.',
   '2026-05-10T09:00:00.000Z',
   'approved', 'google'),

  ('rev-ph-2', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'Marcus T.',
   'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&q=80',
   5,
   'Cocktails & Clay on Friday night is such a fun concept. Our group of four had a blast — the instructor kept us laughing while actually teaching us proper technique. And the clay somehow ended up all over our faces. 10/10 would recommend.',
   NULL, NULL,
   'approved', 'google'),

  ('rev-ph-3', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'Nadia K.',
   'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&q=80',
   5,
   'I did the beachfront session at Klong Muang and it was surreal. Sitting at the wheel with the sea right there, long-tail boats floating past. One of the most memorable things I did in Thailand.',
   'That setting never gets old for us either. Thank you Nadia!',
   '2026-05-18T14:00:00.000Z',
   'approved', 'google'),

  ('rev-ph-4', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'James W.',
   'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&q=80',
   4,
   'Took a wheel class during my second week in Krabi. The instruction is genuinely good — they actually teach you the mechanics of centering rather than just guiding your hands. My piece came out much better than I expected. The 2–3 week turnaround for firing means you need to plan ahead if you want to take it home.',
   'Thanks James, and great point about the firing time. We do offer shipping worldwide for guests who cannot wait.',
   '2026-05-05T11:00:00.000Z',
   'approved', 'google'),

  ('rev-ph-5', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'Camille D.',
   'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=96&q=80',
   5,
   'I got the monthly membership while working remotely from Krabi for six weeks and it was the best decision. Having a creative routine in the afternoons completely changed how I felt about being away from home. The community here is warm and unpretentious.',
   NULL, NULL,
   'approved', 'google'),

  ('rev-ph-6', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'Ryo M.',
   'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=96&q=80',
   5,
   'Clay, calm, and a place to return to each week. That is exactly what this place is. Discovered it on a Tuesday and was back on Friday for Cocktails & Clay. The instructor remembered what I was working on. That kind of attention makes a big difference.',
   NULL, NULL,
   'approved', 'google'),

  ('rev-ph-b1', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-beachfront',
   'Anna R.',
   'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&q=80',
   5,
   'The beachfront session is special. I was staying at a resort in Klong Muang and this was the highlight of my whole trip. Four people, one instructor, the Gulf right there. Totally peaceful and strangely meditative.',
   'Thank you Anna. That little spot is something else.',
   '2026-05-20T10:00:00.000Z',
   'approved', 'google');

-- Q&A
INSERT INTO location_qa
  (id, organization_id, site_id, location_id,
   question, question_author, answer, answer_author,
   is_owner_answer, upvote_count, source, status, sort_order)
VALUES
  ('qa-ph-1', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'Do I need any experience to join a class?', 'A Guest',
   'No experience at all. Our wheel and handbuilding classes are designed for complete beginners, and we work with returning students too. You will be guided the whole way.',
   'Pottery House Krabi', 1, 22, 'manual', 'published', 1),

  ('qa-ph-2', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'Are materials and firing included in the price?', 'A Guest',
   'Yes. Clay, tools, apron, bisque firing, and glaze firing are all included in your class price. Studio glazes are also available for you to choose from.',
   'Pottery House Krabi', 1, 19, 'manual', 'published', 2),

  ('qa-ph-3', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'How long until I can collect my finished piece?', 'A Guest',
   'Pieces are typically ready within 2 to 3 weeks after your class. If you are leaving Krabi before then, we can ship your piece to you anywhere in the world.',
   'Pottery House Krabi', 1, 17, 'manual', 'published', 3),

  ('qa-ph-4', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'How do I book Cocktails & Clay?', 'A Guest',
   'Cocktails & Clay runs every Friday from 7PM to 10PM. You can book online or message us on Instagram @potteryclasseskrabi. Spots fill up so we recommend booking in advance.',
   'Pottery House Krabi', 1, 14, 'manual', 'published', 4),

  ('qa-ph-5', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'Do you offer classes for children?', 'A Guest',
   'Yes, we welcome families. We recommend ages 8 and up for wheel classes. Handbuilding is available for younger children. Let us know when booking.',
   'Pottery House Krabi', 1, 11, 'manual', 'published', 5),

  ('qa-ph-b1', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-beachfront',
   'How do I book the beachfront pottery session?', 'A Guest',
   'The beachfront session at Klong Muang runs on selected days with very limited seats (maximum 4 guests). Message us on Instagram @potteryclasseskrabi or email us to check availability.',
   'Pottery House Krabi', 1, 16, 'manual', 'published', 1);

-- Posts
INSERT INTO posts
  (id, organization_id, site_id, location_id,
   post_type, title, body, image_asset_id,
   status, published_at, created_by)
VALUES
  ('post-ph-1', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'update', 'Doors open, wheels spinning.',
   'Welcome to Pottery House. We are open for wheel classes, handbuilding sessions, and Cocktails & Clay every Friday night. Walk-ins welcome when we have space, but booking ahead is always a good idea. Find us on Instagram @potteryclasseskrabi.',
   'media-ph-post1', 'published', '2026-05-01T10:00:00.000Z', 
   CASE WHEN EXISTS(SELECT 1 FROM user WHERE id = 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO') THEN 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO' ELSE 'user-pottery-house' END),

  ('post-ph-2', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'standard', NULL,
   'Nothing makes our team happier than happy students. Turns out clay, coffee, and a few proud smiles are the perfect recipe. Thank you for making the studio so joyful.',
   'media-ph-post2', 'published', '2026-05-15T10:00:00.000Z', 
   CASE WHEN EXISTS(SELECT 1 FROM user WHERE id = 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO') THEN 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO' ELSE 'user-pottery-house' END),

  ('post-ph-3', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house',
   'offer', 'Cocktails & Clay — Every Friday, 7PM to 10PM',
   'Grab a drink, sit at the wheel, and see what your hands can do. Our Friday night Cocktails & Clay session is social, relaxed, and genuinely fun — whether you are a first-timer or you already know your way around a wheel. ฿1,500 per person. Book via Instagram @potteryclasseskrabi.',
   'media-ph-post3', 'published', '2026-05-20T09:00:00.000Z', 
   CASE WHEN EXISTS(SELECT 1 FROM user WHERE id = 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO') THEN 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO' ELSE 'user-pottery-house' END);

INSERT INTO post_channel_jobs (id, post_id, organization_id, channel, status, published_at)
VALUES
  ('pcj-ph-1', 'post-ph-1', 'org-pottery-house', 'site', 'published', '2026-05-01T10:00:00.000Z'),
  ('pcj-ph-2', 'post-ph-2', 'org-pottery-house', 'site', 'published', '2026-05-15T10:00:00.000Z'),
  ('pcj-ph-3', 'post-ph-3', 'org-pottery-house', 'site', 'published', '2026-05-20T09:00:00.000Z');

-- Site content
INSERT INTO site_content
  (id, organization_id, site_id, location_id,
   page, field, content, hero_title, hero_subtitle, hero_image_asset_id,
   type, source)
VALUES
  ('sc-ph-home-hero', 'org-pottery-house', 'site-pottery-house', NULL,
   'home', 'hero', NULL,
   'Clay, calm, and a place to return to.',
   'Pottery classes, wheel throwing & handbuilding in Krabi, Thailand.',
   'media-ph-hero',
   'text', 'manual'),

  ('sc-ph-cta', 'org-pottery-house', 'site-pottery-house', NULL,
   'home', 'cta.title', 'Book your first class.', NULL, NULL, NULL,
   'text', 'manual'),

  ('sc-ph-story-image', 'org-pottery-house', 'site-pottery-house', NULL,
   'about', 'story.image',
   '/images/pottery-house/705001439_1023555783578064_2057760163234352028_n.jpg',
   NULL, NULL, NULL,
   'media', 'manual'),

  ('sc-ph-story-title', 'org-pottery-house', 'site-pottery-house', NULL,
   'about', 'story.title',
   'A studio shaped by the joy of making.',
   NULL, NULL, NULL,
   'text', 'manual'),

  ('sc-ph-story-body', 'org-pottery-house', 'site-pottery-house', NULL,
   'about', 'story.body',
   'Pottery House started with two potters, a pair of wheels, and a belief that making something with your hands changes the way you feel about a day.

We set up in Krabi because it already pulls people in — travellers who slow down, stay longer, and start looking for something to do with their time that is not just a tour. Clay turned out to be exactly that.

Today the studio is a proper home for ceramics: wheels, a kiln, handbuilding tables, studio glazes, and a beachfront pop-up at Klong Muang when the tides are right. But the feeling is the same as day one. We want you to leave with something you made, something you are proud of, and maybe a reason to come back.',
   NULL, NULL, NULL,
   'richtext', 'manual'),

  ('sc-ph-journey', 'org-pottery-house', 'site-pottery-house', NULL,
   'about', 'journey.body',
   'We teach proper technique, not just guided hand-holding. Centering, opening, pulling — the mechanics matter because they are what let you make something that actually works. Our instructors adapt to where you are, whether that is your first time touching clay or your hundredth.

All firing happens on site in our Skutt kiln. Bisque and glaze firing are always included.',
   NULL, NULL, NULL,
   'textarea', 'manual'),

  ('sc-ph-experience', 'org-pottery-house', 'site-pottery-house', NULL,
   'about', 'experience.body',
   'Come for a single class, come back for Cocktails & Clay, or settle in with a monthly membership. Pottery House is as casual or as serious as you want it to be.

Nothing makes our team happier than happy students.',
   NULL, NULL, NULL,
   'textarea', 'manual');

-- Thai translations
INSERT INTO site_content_translations
  (id, organization_id, site_id, location_id, locale, page, field, content, hero_title, hero_subtitle, value, type, status, source_hash, translated_at, reviewed_at)
VALUES
  ('sct-ph-th-home-hero', 'org-pottery-house', 'site-pottery-house', NULL, 'th', 'home', 'hero',
   NULL, 'ดินเผา ความสงบ และสถานที่ที่อยากกลับมา', 'คลาสปั้นดินเผา ปั้นด้วยวงล้อ และปั้นมือในกระบี่ ประเทศไทย', 'ดินเผา ความสงบ และสถานที่ที่อยากกลับมา', 'text', 'published',
   'ph-th-home-hero-v1', '2026-05-28T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),

  ('sct-ph-th-cta', 'org-pottery-house', 'site-pottery-house', NULL, 'th', 'home', 'cta.title',
   'จองคลาสแรกของคุณ', NULL, NULL, 'จองคลาสแรกของคุณ', 'text', 'published',
   'ph-th-cta-v1', '2026-05-28T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),

  ('sct-ph-th-story-title', 'org-pottery-house', 'site-pottery-house', NULL, 'th', 'about', 'story.title',
   'สตูดิโอที่หล่อหลอมจากความสุขของการสร้างสรรค์', NULL, NULL, 'สตูดิโอที่หล่อหลอมจากความสุขของการสร้างสรรค์', 'text', 'published',
   'ph-th-story-title-v1', '2026-05-28T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),

  ('sct-ph-th-story-body', 'org-pottery-house', 'site-pottery-house', NULL, 'th', 'about', 'story.body',
   'Pottery House เริ่มต้นจากช่างปั้นสองคน วงล้อสองตัว และความเชื่อที่ว่าการสร้างสรรค์สิ่งต่างๆ ด้วยมือของตัวเองจะเปลี่ยนความรู้สึกของคุณที่มีต่อวันหนึ่งๆ

เราตั้งสตูดิโอในกระบี่เพราะที่นี่ดึงดูดผู้คน นักเดินทางที่ชะลอความเร็ว พักอยู่นานขึ้น และเริ่มมองหาสิ่งที่จะทำกับเวลาของตัวเองที่ไม่ใช่แค่ทัวร์ ดินเผากลายเป็นคำตอบที่ลงตัว',
   NULL, NULL,
   'Pottery House เริ่มต้นจากช่างปั้นสองคน วงล้อสองตัว และความเชื่อในพลังของการสร้างด้วยมือ',
   'richtext', 'published', 'ph-th-story-body-v1',
   '2026-05-28T00:00:00.000Z', '2026-05-28T00:00:00.000Z');

INSERT INTO business_location_translations
  (id, organization_id, site_id, location_id, locale, title, address, city, description, short_description, status, source_hash, translated_at, reviewed_at)
VALUES
  ('blt-ph-th-loc', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-house', 'th',
   'Pottery House กระบี่', '', 'กระบี่',
   'สตูดิโอเซรามิกในกระบี่ บรรยากาศอบอุ่น เรียนปั้นวงล้อและปั้นมือ พร้อมบริการเผาดินและเคลือบครบชุด เหมาะสำหรับทุกระดับ',
   'คลาสปั้นดินเผา วงล้อ และปั้นมือในกระบี่ รวมวัสดุและการเผาทุกอย่าง',
   'published', 'ph-th-location-v1',
   '2026-05-28T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),

  ('blt-ph-th-beach', 'org-pottery-house', 'site-pottery-house', 'loc-pottery-beachfront', 'th',
   'Pottery House — บีชฟร้อนท์ กล่องม่วง', 'ซีวิว กล่องม่วง', 'กระบี่',
   'คลาสปั้นวงล้อบนชายหาด ณ ซีวิว กล่องม่วง มองเห็นทะเลอ่าวไทย ที่นั่งจำกัดมาก',
   'คลาสปั้นวงล้อบนชายหาดกล่องม่วง ที่นั่งจำกัด วิวทะเลอ่าวไทย',
   'published', 'ph-th-beachfront-v1',
   '2026-05-28T00:00:00.000Z', '2026-05-28T00:00:00.000Z');

-- AI credits and billing
INSERT INTO ai_credits (organization_id, balance, lifetime_used, last_topped_up_at)
VALUES ('org-pottery-house', 500, 0, '2026-05-28T00:00:00.000Z');

INSERT INTO organization_billing (id, organization_id, status, plan)
VALUES ('billing-pottery-house', 'org-pottery-house', 'free', 'free');
