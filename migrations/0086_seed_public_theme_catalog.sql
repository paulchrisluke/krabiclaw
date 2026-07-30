INSERT INTO themes (id, name, slug, version, description, status)
VALUES
  ('saya-theme-v1', 'Saya', 'saya', '1.0.0', 'Restaurant and experience public template', 'active'),
  ('blawby-theme-v1', 'Blawby', 'blawby', '1.0.0', 'Professional-service public template', 'active')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  slug = excluded.slug,
  version = excluded.version,
  description = excluded.description,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
