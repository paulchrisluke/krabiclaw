// Seed only structural records for a newly created site. Customer-facing copy
// must be supplied by the owner or an approved import.
// All records use source='template' so ChowBot can identify and reference them.

import type { SiteVertical } from "~/utils/vertical-copy";
import { executeBatch, queryFirst, type BatchQuery, type DbClient } from "~/server/db";
import { createTenantPagesBatch } from "~/server/utils/tenant-pages";

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

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
      (id, organization_id, site_id, locale, label, is_source, status)
    VALUES (?, ?, ?, 'en', 'English', 1, 'published')
  `,
    params: [`locale::${organizationId}::${siteId}::en`, organizationId, siteId],
  });

  // ── Empty primary location ────────────────────────────────────────────────
  statements.push({
    query: `
    INSERT OR IGNORE INTO business_locations
      (id, organization_id, site_id, slug, title, rating, review_count, is_primary, status)
    VALUES (?, ?, ?, 'main', ?, 0, 0, 1, 'active')
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

  // No customer-facing hero, menu, Q&A, post, or story content is seeded here.
  // Public sections remain empty until the owner supplies canonical content.

  // ── Canonical tenant pages (structural records only) ──────────────────────
  const templatePageContent: Array<[string, string, string, string?]> = []

  await executeBatch(db, statements);

  const pageRows = new Map<string, Array<[string, string, string, string?]>>();
  for (const row of templatePageContent) {
    const rows = pageRows.get(row[0]) ?? [];
    rows.push(row);
    pageRows.set(row[0], rows);
  }
  const templatePages = new Map<string, { path: string; pageType: 'system' | 'recipe' | 'legal'; recipe: string }>([
    ['home', { path: '/', pageType: 'system', recipe: 'home' }],
    ['about', { path: '/about', pageType: 'system', recipe: 'about' }],
    ['contact', { path: '/contact', pageType: 'system', recipe: 'contact' }],
    ['location', { path: '/locations/main', pageType: 'system', recipe: 'locations' }],
  ]);
  if (vertical === 'professional_service') {
    for (const [page, path, pageType] of [
      ['services', '/services', 'system'],
      ['pricing', '/pricing', 'system'],
      ['donate', '/donate', 'system'],
      ['schedule', '/schedule', 'system'],
      ['privacy', '/policies/privacy', 'legal'],
      ['terms', '/policies/terms', 'legal'],
      ['third-party-notices', '/third-party-notices', 'legal'],
    ] as const) templatePages.set(page, { path, pageType, recipe: page });
  }
  const pagesToCreate: Array<{
    data: {
      locale: string
      path: string
      title: string
      pageType: 'system' | 'recipe' | 'legal'
      recipe: string
      blocks: Array<{ id: string; type: string; position: number; data: Record<string, unknown> }>
      publish: boolean
    }
    trustedSystemPage: boolean
  }> = []
  for (const [page, definition] of templatePages) {
    const rows = pageRows.get(page) ?? [];
    const blocks: Array<{ id: string; type: string; position: number; data: Record<string, unknown> }> = [];
    for (const [field, content, type] of rows.map(row => [row[1], row[2], row[3]] as const)) {
      if (field === 'hero.title' || field === 'hero.subtitle') continue;
      blocks.push({
        id: uid('block'), type: type === 'richtext' || type === 'textarea' ? 'markdown' : 'heading', position: blocks.length,
        data: { field, ...(type === 'richtext' || type === 'textarea' ? { markdown: content } : { text: content, level: 2 }) },
      });
    }
    pagesToCreate.push({
      trustedSystemPage: definition.pageType === 'system',
      data: {
        locale: 'en', path: definition.path, title: page,
        pageType: definition.pageType, recipe: definition.recipe, blocks, publish: true,
      },
    })
  }
  await createTenantPagesBatch(db, { organizationId, siteId, pages: pagesToCreate })
}
