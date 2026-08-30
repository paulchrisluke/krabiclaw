// Tenant resolution middleware for KrabiClaw SaaS
// Determines if request is for platform or tenant site

import { HTTPError, defineHandler  } from 'nitro';
import type { H3Event } from 'nitro';
import { redirect } from 'nitro/h3';
import { queryFirst, type DbClient } from "~/server/db";
import { TENANT_TYPES, type TenantType } from "~/utils/tenant-routing";
import { cloudflareEnv, isInternalSelfFetch } from "../utils/api-response";
import {
  environmentTenantAliasSlug,
  getFreeSiteDomain,
  hostnameOf,
  isPlatformHost,
  usesTenantHeader,
  type TenantHostEnv,
} from "../utils/tenant-hosts";
import { verifyScopedPreviewToken } from "../utils/preview-token";
import { isPlatformPath } from "~/utils/platform-routes";
import { getDraftMedia, parseOnboardingDraftPayload } from "~/server/utils/onboarding-drafts";
import { resolvePublicTemplate } from "~/utils/template-registry";
import { PLATFORM_SITE_ID } from '~/shared/platform-scope'

interface TenantSiteRow {
  id: string;
  organization_id: string;
  theme_id: string | null;
  subdomain: string;
  onboarding_status: string;
  canonical_domain: string | null;
  brand_name: string | null;
  media_json: string;
  vertical: string | null;
}

interface TenantSiteMedia {
  asset_id: string
  slot: string
  public_url: string | null
  thumbnail_url: string | null
  kind: string
  mime_type: string | null
}

const SITE_MEDIA_SELECT_SQL = `(SELECT COALESCE(json_group_array(json_object(
  'asset_id', ordered.asset_id, 'slot', ordered.slot, 'public_url', ordered.public_url,
  'thumbnail_url', ordered.thumbnail_url, 'kind', ordered.kind, 'mime_type', ordered.mime_type
)), json('[]')) FROM (
  SELECT mp.asset_id, mp.slot, ma.public_url, ma.thumbnail_url, ma.kind, ma.mime_type, mp.id
  FROM media_placements mp JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
  WHERE mp.site_id = s.id AND mp.owner_type = 'site' AND mp.owner_id = s.id AND mp.status = 'active'
  ORDER BY mp.slot, mp.sort_order, mp.id
) ordered)`

function tenantSiteMedia(site: Pick<TenantSiteRow, 'media_json'>): TenantSiteMedia[] {
  return JSON.parse(site.media_json) as TenantSiteMedia[]
}

export interface SpentSubdomainResolution {
  spent: true
  successorDomain: string | null
}

function isSpentSubdomainResolution(
  value: TenantSiteRow | SpentSubdomainResolution,
): value is SpentSubdomainResolution {
  return 'spent' in value
}

function setTenantType(event: H3Event, tenantType: TenantType) {
  event.context.tenantType = tenantType;
}

function normalizedPath(pathname: string) {
  return pathname === "/" ? "/" : pathname.replace(/\/$/, "");
}

function requireTenantMetadata(site: Pick<TenantSiteRow, 'theme_id' | 'vertical' | 'brand_name'>, source: string) {
  const themeId = site.theme_id?.trim()
  const vertical = site.vertical?.trim()
  const brandName = site.brand_name?.trim()
  if (!themeId || !vertical || !brandName) {
    throw new HTTPError({
      statusCode: 500,
      statusMessage: `Tenant ${source} is missing canonical identity or template metadata`,
      data: { code: 'TENANT_METADATA_INCOMPLETE' },
    })
  }
  return { themeId, vertical, brandName }
}

async function resolveRegisteredSubdomainSite(
  db: DbClient,
  env: TenantHostEnv,
  tenantSlug: string,
): Promise<TenantSiteRow | null> {
  const tenantDomain = `${tenantSlug}.${getFreeSiteDomain(env)}`
  return await queryFirst<TenantSiteRow>(
    db,
    `
      SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status,
             canonical.domain AS canonical_domain,
             s.brand_name, ${SITE_MEDIA_SELECT_SQL} AS media_json, s.vertical
      FROM sites s
      JOIN site_domains requested
        ON requested.site_id = s.id
       AND requested.type = 'subdomain'
       AND requested.status = 'active'
      LEFT JOIN site_domains canonical
        ON canonical.site_id = s.id
       AND canonical.role = 'canonical'
       AND canonical.status = 'active'
      WHERE requested.domain = ? AND s.status = 'active' AND s.onboarding_status = 'active'
      LIMIT 1
    `,
    [tenantDomain],
  )
}

function setResolvedTenantContext(
  event: H3Event,
  site: TenantSiteRow,
  host: string,
  canonicalDomain: string | null,
) {
  const metadata = requireTenantMetadata(site, site.id)
  event.context.siteId = site.id
  event.context.organizationId = site.organization_id
  event.context.themeId = metadata.themeId
  event.context.onboardingStatus = site.onboarding_status
  setTenantType(event, TENANT_TYPES.TENANT)
  event.context.tenantHost = hostnameOf(host)
  event.context.canonicalDomain = canonicalDomain
  event.context.site = {
    brand_name: metadata.brandName,
    media: tenantSiteMedia(site),
    vertical: metadata.vertical,
  }
}

export default defineHandler(async (event) => {
  // Nested self-fetches (i18n/icon/internal API calls during SSR) never carry
  // tenant context downstream handlers rely on — the real inbound request
  // already resolved tenant type/host before triggering these. Skip the DB
  // lookup and host parsing entirely rather than redoing it per phantom request.
  if (isInternalSelfFetch(event)) {
    return;
  }

  const url = event.url;
  const tenantPath = normalizedPath(url.pathname);
  // Public site APIs carry an explicit site ID and resolve that site through
  // their canonical service. Host-based tenant resolution would duplicate the
  // same database lookup without adding an authorization boundary.
  if (tenantPath.startsWith("/api/public/sites/")) return;
  const host = (event.req.headers.get("host")) || "";
  const env = cloudflareEnv(event);

  // Local and raw workers.dev hosts cannot express tenant identity in their
  // hostname, so their test harness carries it explicitly. Deployed preview and
  // staging use direct environment aliases below.
  if (usesTenantHeader(host)) {
    const previewSlug = (event.req.headers.get("x-preview-tenant"));
    if (previewSlug && /^[a-z0-9-]+$/.test(previewSlug)) {
      const db = env.db;
      if (db) {
        const site = await resolveRegisteredSubdomainSite(db, env, previewSlug)
        if (site) {
          setResolvedTenantContext(event, site, host, hostnameOf(host))
          return;
        }
      }
    }
  }

  const aliasSlug = environmentTenantAliasSlug(host, env)
  if (aliasSlug) {
    const site = env.db
      ? await resolveRegisteredSubdomainSite(env.db, env, aliasSlug)
      : null
    if (site) {
      setResolvedTenantContext(event, site, host, hostnameOf(host))
      return
    }
    setTenantType(event, TENANT_TYPES.TENANT_404)
    event.context.siteId = null
    return
  }

  // Platform-hosted preview routes: /preview/site/[siteId]/...
  // Token verification is deferred to the bootstrap endpoint — the middleware
  // only resolves the site identity so composables see the correct tenant context.
  // Only allow preview routes on platform hosts (localhost/krabiclaw.com) to prevent
  // tenant/custom hosts from bypassing normal tenant resolution.
  const previewRouteMatch = url.pathname.match(/^\/preview\/site\/([^/?]+)/);
  if (previewRouteMatch && isPlatformHost(host, env) && isPlatformPath(url.pathname)) {
    const previewSiteId = previewRouteMatch[1]!;
    const db = env.db;
    if (db) {
      const previewSite = await queryFirst<
        Pick<
          TenantSiteRow,
          | "id"
          | "organization_id"
          | "theme_id"
          | "onboarding_status"
          | "brand_name"
          | "media_json"
          | "vertical"
        >
      >(
        db,
        `
        SELECT s.id, s.organization_id, s.theme_id, s.onboarding_status, s.brand_name,
               ${SITE_MEDIA_SELECT_SQL} AS media_json, s.vertical
        FROM sites s
        WHERE s.id = ? AND s.status = 'active'
        LIMIT 1
      `,
        [previewSiteId],
      );
      if (previewSite) {
        const metadata = requireTenantMetadata(previewSite, previewSite.id)
        event.context.siteId = previewSite.id;
        event.context.organizationId = previewSite.organization_id;
        event.context.themeId = metadata.themeId;
        event.context.onboardingStatus = previewSite.onboarding_status;
        setTenantType(event, TENANT_TYPES.TENANT);
        event.context.site = {
          brand_name: metadata.brandName,
          media: tenantSiteMedia(previewSite),
          vertical: metadata.vertical,
        };
        return;
      }
    }
  }

  const previewDraftMatch = url.pathname.match(/^\/preview\/draft\/([^/?]+)/);
  if (previewDraftMatch && isPlatformHost(host, env) && isPlatformPath(url.pathname)) {
    const draftId = previewDraftMatch[1]!;
    const previewToken = url.searchParams.get("token");
    const db = env.db;
    if (db) {
      const previewDraft = await queryFirst<{
        id: string;
        name: string;
        vertical: string | null;
        payload_json: string;
      }>(
        db,
        `
        SELECT id, name, vertical, payload_json
        FROM onboarding_drafts
        WHERE id = ? AND status = 'active'
        LIMIT 1
      `,
        [draftId],
      );

      // Verify token as a signed stateless scoped token with scope and expiry validation
      const previewSecret =
        typeof env.PREVIEW_SECRET === "string" && env.PREVIEW_SECRET.trim()
          ? env.PREVIEW_SECRET.trim()
          : null;
      if (previewDraft && previewToken && previewSecret) {
        const isAuthorized = await verifyScopedPreviewToken(
          previewSecret,
          "draft",
          draftId,
          previewToken,
        );
        if (isAuthorized) {
          const payload = parseOnboardingDraftPayload(previewDraft.payload_json);
          const template = resolvePublicTemplate({ vertical: previewDraft.vertical });
          if (!template) {
            throw new HTTPError({ statusCode: 500, statusMessage: 'Draft preview has no supported template', data: { code: 'DRAFT_TEMPLATE_MISSING' } })
          }
          event.context.draftId = previewDraft.id;
          setTenantType(event, TENANT_TYPES.TENANT);
          event.context.themeId = template.themeId;
          event.context.onboardingStatus = "active";
          event.context.site = {
            brand_name: previewDraft.name || null,
            media: getDraftMedia(payload, 'logo') ? [{
              asset_id: getDraftMedia(payload, 'logo')!.draftAssetId,
              slot: 'logo',
              public_url: getDraftMedia(payload, 'logo')!.publicUrl,
              thumbnail_url: null,
              kind: 'image',
              mime_type: null,
            }] : [],
            vertical: previewDraft.vertical,
          };
          return;
        }
      }
    }
  }

  const isPlatform = isPlatformHost(host, env);

  // Normal requests resolve platform-vs-tenant by host. Tenant sites own their
  // public route families; isPlatformPath() is only a preview-route guard on a
  // confirmed platform host.
  if (isPlatform) {
    setTenantType(event, TENANT_TYPES.PLATFORM);
    event.context.siteId = null;
    const platformSite = env.db
      ? await queryFirst<Pick<TenantSiteRow, 'brand_name' | 'media_json' | 'vertical'>>(env.db, `
          SELECT s.brand_name, ${SITE_MEDIA_SELECT_SQL} AS media_json, s.vertical
          FROM sites s WHERE s.id = ? AND s.status = 'active' LIMIT 1
        `, [PLATFORM_SITE_ID])
      : null
    event.context.site = {
      brand_name: platformSite?.brand_name?.trim() || 'KrabiClaw',
      media: platformSite ? tenantSiteMedia(platformSite) : [],
      vertical: platformSite?.vertical ?? null,
    }
    return;
  }

  // Tenant site resolution
  const site = await resolveTenantSite(host, event);

  if (site && isSpentSubdomainResolution(site)) {
    if (site.successorDomain) {
      return redirect(`https://${site.successorDomain}${url.pathname}${url.search}`, 301)
    }
    throw new HTTPError({ statusCode: 410, statusMessage: 'Gone' })
  }

  // If site found, handle based on onboarding status
  if (site) {
    setResolvedTenantContext(event, site, host, site.canonical_domain || null)
    return;
  }

  // No tenant found - this is an unknown subdomain/custom domain
  setTenantType(event, TENANT_TYPES.TENANT_404);
  event.context.siteId = null;
});

export async function resolveTenantSite(
  host: string,
  event: Parameters<typeof cloudflareEnv>[0],
): Promise<TenantSiteRow | SpentSubdomainResolution | null> {
  const runtimeEnv = cloudflareEnv(event);
  const db = runtimeEnv.db;
  const hostname = hostnameOf(host);

  if (!db || !hostname) return null;

  // Local development support (e.g., demo.localhost)
  if (hostname.includes(".localhost")) {
    const subdomain = hostname.split(".")[0];
    return await queryFirst<TenantSiteRow>(
      db,
      `
      SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status,
             s.subdomain || '.localhost' AS canonical_domain,
             s.brand_name, ${SITE_MEDIA_SELECT_SQL} AS media_json, s.vertical
      FROM sites s
      WHERE s.subdomain = ? AND s.status = 'active'
      LIMIT 1
    `,
      [subdomain],
    );
  }

  const site = await queryFirst<TenantSiteRow>(
    db,
    `
    SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status, sd.domain,
           COALESCE(canonical.domain, sd.domain) AS canonical_domain,
           s.brand_name, ${SITE_MEDIA_SELECT_SQL} AS media_json, s.vertical
    FROM sites s
    JOIN site_domains sd ON s.id = sd.site_id
    LEFT JOIN site_domains canonical
      ON canonical.site_id = s.id AND canonical.role = 'canonical' AND canonical.status = 'active'
    WHERE sd.domain = ? AND sd.type IN ('custom', 'subdomain') AND sd.status = 'active'
      AND s.status = 'active' AND s.onboarding_status = 'active'
    LIMIT 1
  `,
    [hostname],
  )
  if (site) return site

  const spent = await queryFirst<{ successor_domain: string | null }>(
    db,
    'SELECT successor_domain FROM spent_subdomains WHERE domain = ? LIMIT 1',
    [hostname],
  )
  return spent
    ? { spent: true, successorDomain: spent.successor_domain }
    : null
}
