// Seed only structural records for a newly created organization. Customer-facing
// copy must be supplied by the owner or an approved import.
// All records use source='template' so ChowBot can identify and reference them.

import { getVerticalCopy, type OrganizationVertical } from "~/utils/vertical-copy";
import { executeBatch, queryFirst, type BatchQuery, type DbClient } from "~/server/db";
import { createTenantPagesBatch } from "~/server/utils/content/pages";

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function seedNewOrganization(
  db: DbClient,
  params: {
    env: CloudflareEnv;
    organizationId: string;
    name: string;
    vertical: OrganizationVertical;
  },
): Promise<string> {
  if (!db) throw new Error("Database not configured");

  const { env, organizationId, name, vertical } = params;

  // Reuse existing location on resume (provisioning may have failed mid-seed)
  const existing = await queryFirst<{ id: string }>(
    db,
    "SELECT id FROM business_locations WHERE organization_id = ? AND slug = ? LIMIT 1",
    [organizationId, "main"],
  );
  const locationId = existing?.id ?? uid("loc");

  const statements: BatchQuery[] = [];

  statements.push({
    query: `
    INSERT OR IGNORE INTO business_locations
      (id, organization_id, slug, title, rating, review_count, status)
    VALUES (?, ?, 'main', ?, 0, 0, 'active')
  `,
    params: [locationId, organizationId, name],
  });


  // ── Canonical tenant pages (structural records only) ──────────────────────
  await executeBatch(db, statements);

  // `title` is the page's name as a person reads it — its document title and,
  // for every page but the home page, its heading. The key beside it is an
  // identifier, and using it as the title is what wrote 'about' and 'contact'
  // into the title column and rendered them as h1s.
  const templatePages = new Map<string, { path: string; title: string; pageType: 'system' | 'recipe' | 'legal'; recipe: string }>([
    ['home', { path: '/', title: 'Home', pageType: 'system', recipe: 'home' }],
    ['about', { path: '/about', title: 'About', pageType: 'system', recipe: 'about' }],
    ['contact', { path: '/contact', title: 'Contact', pageType: 'system', recipe: 'contact' }],
    // There is no '/locations/main' page. A location detail route renders the
    // business_locations row and its datasets: usePublicPageRequest gives it the
    // page key 'location', canonicalTenantPagePath() has no entry for that, and
    // ROUTE_PAGE_PATHS has no 'locations' recipe. The page document this used to
    // create was never read by anything.
  ]);
  if (vertical === 'service') {
    for (const [page, path, title, pageType] of [
      ['services', '/services', 'Services', 'system'],
      ['pricing', '/pricing', 'Pricing', 'system'],
      ['donate', '/donate', 'Donate', 'system'],
      ['schedule', '/schedule', 'Schedule', 'system'],
      ['privacy', '/policies/privacy', 'Privacy Policy', 'legal'],
      ['terms', '/policies/terms', 'Terms of Service', 'legal'],
      ['third-party-notices', '/third-party-notices', 'Third-Party Notices', 'legal'],
    ] as const) templatePages.set(page, { path, title, pageType, recipe: page });
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
  for (const definition of templatePages.values()) {
    const blocks: Array<{ id: string; type: string; position: number; data: Record<string, unknown> }> = [
      {
        id: uid('block'),
        type: 'hero',
        position: 0,
        // The home page's heading is the owner's headline, which onboarding
        // collects, so it starts empty. Every other page's heading is the page's
        // own name and is known here — leaving it null made those pages depend
        // on a reader falling through to the document title.
        // `section` is not copy: it says which hero slot on the page this block
        // fills, and the Blawby template resolves its home hero by it.
        data: {
          title: definition.path === '/' ? null : definition.title,
          subtitle: null,
        },
      },
    ];
    pagesToCreate.push({
      trustedSystemPage: definition.pageType === 'system',
      data: {
        locale: 'en', path: definition.path, title: definition.title,
        pageType: definition.pageType, recipe: definition.recipe, blocks,
      },
    })
  }
  await createTenantPagesBatch(db, { env, organizationId, pages: pagesToCreate })

  // ── Consultation settings (professional services only) ────────────────────
  // The Blawby shell reads settings_json.$.consultation on every route and
  // refuses to render without it (getPublicConsultationSettings throws
  // CONSULTATION_SETTINGS_MISSING), so a professional-service tenant is not
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
      "SELECT json_type(settings_json, '$.consultation') IS NOT NULL AS present FROM organization WHERE id = ? LIMIT 1",
      [organizationId],
    );
    if (!configured?.present) {
      // Consultation settings live on the organization, read back by
      // server/utils/professional-services.ts. The editor that used to wrap
      // this write went with the offerings model; the setting did not.
      await executeBatch(db, [{
        query: `UPDATE organization SET settings_json = json_set(COALESCE(settings_json, '{}'), '$.consultation', json(?)), updated_at = ?
                 WHERE id = ?`,
        params: [
          JSON.stringify({
            mode: "native_disabled",
            cta_label: getVerticalCopy(vertical).reservationRequestButton,
            external_url: null,
            schedule_path: "/schedule",
            confirmation_path: "/contact/confirmed",
            tracking_enabled: false,
            contact_form_enabled: true,
            metadata: {},
          }),
          new Date().toISOString(),
          organizationId,
        ],
      }], { operation: 'Seed consultation settings' });
    }
  }

  return locationId
}
