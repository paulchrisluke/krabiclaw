-- Seed data for KrabiClaw Platform
-- Creates a default demo restaurant

-- 1. Create a demo user
DELETE FROM user WHERE id = 'user_demo';
INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('user_demo', 'Demo User', 'demo@krabiclaw.com', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 2. Create an organization
DELETE FROM organization WHERE id = 'org_demo';
INSERT INTO organization (id, name, slug, createdAt) VALUES ('org_demo', 'Demo Organization', 'demo-org', CURRENT_TIMESTAMP);
-- 2.1. Add demo user as member of organization
DELETE FROM member WHERE id = 'member_demo';
INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES ('member_demo', 'org_demo', 'user_demo', 'owner', CURRENT_TIMESTAMP);

-- 3. Create a theme if not exists
INSERT INTO themes (id, name, slug, version, description, status) 
VALUES ('saya-theme-v1', 'Saya Restaurant Theme', 'saya', '1.0.0', 'Default restaurant website theme', 'active') 
ON CONFLICT(id) DO NOTHING;

-- 4. Create a site
DELETE FROM sites WHERE id = 'site_demo';
INSERT INTO sites (id, organization_id, theme_id, name, slug, subdomain, status, onboarding_status) 
VALUES ('site_demo', 'org_demo', 'saya-theme-v1', 'Demo Restaurant', 'demo-restaurant', 'demo', 'active', 'active');

-- 5. Create a domain for the site
DELETE FROM site_domains WHERE id = 'domain_demo';
INSERT INTO site_domains (id, organization_id, site_id, domain, type, status)
VALUES ('domain_demo', 'org_demo', 'site_demo', 'demo.localhost', 'subdomain', 'active');

-- 6. Create some basic content
DELETE FROM site_content WHERE site_id = 'site_demo';
INSERT INTO site_content (id, organization_id, site_id, page, field, content, type, source)
VALUES ('content_hero_title', 'org_demo', 'site_demo', 'home', 'hero_title', 'Welcome to Our Restaurant', 'text', 'manual');

INSERT INTO site_content (id, organization_id, site_id, page, field, content, type, source)
VALUES ('content_hero_subtitle', 'org_demo', 'site_demo', 'home', 'hero_subtitle', 'Experience the finest flavors with KrabiClaw.', 'text', 'manual');

-- 7. Create a menu
DELETE FROM menus WHERE site_id = 'site_demo';
INSERT INTO menus (id, organization_id, site_id, name, description, status)
VALUES ('menu_main', 'org_demo', 'site_demo', 'Main Menu', 'Our daily selection of fresh dishes', 'published');
