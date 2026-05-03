-- Add type and source columns to site_content (backward compatible)
ALTER TABLE site_content ADD COLUMN type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE site_content ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

-- Add type and source columns to site_content_drafts (backward compatible)
ALTER TABLE site_content_drafts ADD COLUMN type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE site_content_drafts ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

-- Seed default published content for all pages (idempotent)
INSERT OR IGNORE INTO site_content (id, page, field, content, type, source) VALUES
  -- home
  ('home-cta-title',          'home',         'cta.title',        'Ready to Experience KIKUZUKI?',                                                   'text',     'manual'),
  ('home-cta-description',    'home',         'cta.description',  'Whether you''re joining us for a casual dinner or a special celebration, we look forward to serving you the finest Japanese cuisine in Krabi.', 'richtext', 'manual'),
  ('home-hero-title',         'home',         'hero.title',       'Take Me Away by KIKUZUKI',                                                        'text',     'manual'),
  ('home-hero-subtitle',      'home',         'hero.subtitle',    'Authentic Japanese Robatayaki Experience in Krabi',                               'text',     'manual'),
  ('home-hero-video',         'home',         'hero.video',       '/videos/hero-video.mp4',                                                          'text',     'manual'),

  -- about
  ('about-hero-title',        'about',        'hero.title',       'About KIKUZUKI',                                                                  'text',     'manual'),
  ('about-hero-subtitle',     'about',        'hero.subtitle',    'Authentic Japanese Robatayaki Experience in Krabi',                               'text',     'manual'),
  ('about-grill-title',       'about',        'grill.title',      'Mastery of the Grill',                                                            'text',     'manual'),
  ('about-sushi-title',       'about',        'sushi.title',      'Artistry in Sushi',                                                               'text',     'manual'),
  ('about-journey-title',     'about',        'journey.title',    'Our Journey',                                                                     'text',     'manual'),

  -- contact
  ('contact-hero-title',      'contact',      'hero.title',       'Contact Us',                                                                      'text',     'manual'),
  ('contact-hero-subtitle',   'contact',      'hero.subtitle',    'Get in Touch with KIKUZUKI',                                                      'text',     'manual'),
  ('contact-social-fb',       'contact',      'social.facebook',  'https://www.facebook.com/kikuzuki-thailand',                                      'text',     'manual'),
  ('contact-social-ig',       'contact',      'social.instagram', 'https://www.instagram.com/kikuzuki-thailand',                                     'text',     'manual'),

  -- location
  ('location-hero-title',     'location',     'hero.title',       'Location & Hours',                                                                'text',     'manual'),
  ('location-hero-subtitle',  'location',     'hero.subtitle',    'Visit Us in Krabi, Thailand',                                                     'text',     'manual'),

  -- menu
  ('menu-hero-title',         'menu',         'hero.title',       'Our Menu',                                                                        'text',     'manual'),
  ('menu-hero-subtitle',      'menu',         'hero.subtitle',    'Authentic Japanese Robatayaki Izakaya',                                           'text',     'manual'),

  -- reservations
  ('res-hero-title',          'reservations', 'hero.title',       'Reserve a Table at KIKUZUKI',                                                     'text',     'manual'),
  ('res-hero-subtitle',       'reservations', 'hero.subtitle',    'Book Your Authentic Japanese Robatayaki Experience',                              'text',     'manual'),
  ('res-contact-phone',       'reservations', 'contact.phone',    '+66 81 154 3606',                                                                 'text',     'manual'),
  ('res-contact-email',       'reservations', 'contact.email',    'info@kikuzuki-thailand.com',                                                      'text',     'manual');
