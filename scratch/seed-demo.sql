-- Seed an organization and a site for testing
INSERT INTO organization (id, name, slug)
VALUES ('org-1', 'Demo Restaurant Group', 'demo-group');

INSERT OR IGNORE INTO themes (id, name, slug, version, description, status)
VALUES ('saya-theme-v1', 'Saya', 'saya', '1.0.0', 'Default restaurant website theme', 'active');

INSERT INTO sites (id, organization_id, theme_id, slug, subdomain, status, onboarding_status)
VALUES ('site-1', 'org-1', 'saya-theme-v1', 'scratch-demo-restaurant', 'scratch-demo', 'active', 'active');

INSERT INTO site_domains (id, organization_id, site_id, domain, type, status)
VALUES ('dom-1', 'org-1', 'site-1', 'scratch-demo.localhost', 'subdomain', 'active');

-- Seed a location
INSERT INTO business_locations (id, organization_id, site_id, slug, title, status, is_primary)
VALUES ('loc-1', 'org-1', 'site-1', 'main-branch', 'Main Street Branch', 'active', TRUE);

-- Seed some content
INSERT INTO site_content (id, organization_id, site_id, page, field, content, type)
VALUES ('cont-1', 'org-1', 'site-1', 'home', 'hero.title', 'Welcome to Demo Restaurant', 'text');
