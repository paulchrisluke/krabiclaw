// Seed only structural records for a newly created site. Customer-facing copy
// must be supplied by the owner or an approved import.
// All records use source='template' so ChowBot can identify and reference them.

import { getVerticalCopy, type SiteVertical } from "~/utils/vertical-copy";
import { heroBlockSection } from "~/utils/tenant-page-blocks";
import { executeBatch, queryFirst, type BatchQuery, type DbClient } from "~/server/db";
import { createTenantPagesBatch } from "~/server/utils/content/pages";
import { upsertProfessionalServiceContent } from "~/server/utils/professional-services-editor";

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
): Promise<string> {
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

  statements.push({
    query: `
    INSERT OR IGNORE INTO business_locations
      (id, organization_id, site_id, slug, title, rating, review_count, status)
    VALUES (?, ?, ?, 'main', ?, 0, 0, 'active')
  `,
    params: [locationId, organizationId, siteId, name],
  });


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
  if (vertical === 'service') {
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
    }
    trustedSystemPage: boolean
  }> = []
  for (const [page, definition] of templatePages) {
    const rows = pageRows.get(page) ?? [];
    const blocks: Array<{ id: string; type: string; position: number; data: Record<string, unknown> }> = [
      {
        id: uid('block'),
        type: 'hero',
        position: 0,
        // No words yet — the owner has not written a headline. `section` is not
        // copy: it says which hero slot on the page this block fills, and the
        // Blawby template resolves its home hero by it.
        data: { section: heroBlockSection(definition.path), title: null, subtitle: null },
      },
    ];
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
        pageType: definition.pageType, recipe: definition.recipe, blocks,
      },
    })
  }
  await createTenantPagesBatch(db, { organizationId, siteId, pages: pagesToCreate })

  // ── Consultation settings (professional services only) ────────────────────
  // The Blawby shell reads settings_json.$.consultation on every route and
  // refuses to render without it (getPublicConsultationSettings throws
  // CONSULTATION_SETTINGS_MISSING), so a professional-service site is not
  // renderable until this exists. Nothing here is customer-facing copy the
  // owner has to write: the mode is the honest "no external scheduler has been
  // connected", the two paths are the template's own routes (/schedule is
  // seeded above; /contact/confirmed is the Blawby confirmation route in
  // utils/template-registry.ts), and the label is the product's own word for
  // this button in the professional-service copy registry. The owner changes
  // any of it from the dashboard or ChatGPT, through the same writer used here.
  if (vertical === "service") {
    const configured = await queryFirst<{ present: number }>(
      db,
      "SELECT json_type(settings_json, '$.consultation') IS NOT NULL AS present FROM sites WHERE id = ? LIMIT 1",
      [siteId],
    );
    if (!configured?.present) {
      await upsertProfessionalServiceContent(db, {
        organizationId,
        siteId,
        data: {
          consultation: {
            mode: "native_disabled",
            cta_label: getVerticalCopy(vertical).reservationRequestButton,
            schedule_path: "/schedule",
            confirmation_path: "/contact/confirmed",
          },
        },
      });
    }
  }

  return locationId
}
