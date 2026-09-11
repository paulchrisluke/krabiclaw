// Tenant resolution middleware: every host, KrabiClaw's own included, resolves
// to a site row. The site's template decides whether it renders as the
// platform (marketing, docs, blog) or as a customer site.

import { HTTPError, defineHandler  } from 'nitro';
import type { H3Event } from 'nitro';
import { redirect } from 'nitro/h3';
import { queryFirst, type DbClient } from "~/server/db";
import { TENANT_TYPES, type TenantType } from "~/utils/tenant-routing";
import { cloudflareEnv, isInternalSelfFetch } from "../utils/api-response";
import {
  environmentTenantAliasSlug,
  hostnameOf,
  isPlatformHost,
  usesTenantHeader,
} from "../utils/tenant-hosts";
import { previewSecretOf, resolvePreviewAuthorization } from "../utils/preview-token";
import { PLATFORM_TEMPLATE, resolvePublicTemplate } from "~/utils/template-registry";
import { publicSocialMediaFromJson } from '~/server/utils/public-social-image'

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

const SITE_MEDIA_SELECT_SQL = `(SELECT COALESCE(json_group_array(json_object(
  'asset_id', ordered.asset_id, 'slot', ordered.slot, 'public_url', ordered.public_url,
  'thumbnail_url', ordered.thumbnail_url, 'kind', ordered.kind, 'mime_type', ordered.mime_type
)), json('[]')) FROM (
  SELECT mp.asset_id, mp.slot, ma.public_url, ma.thumbnail_url, ma.kind, ma.mime_type, mp.id
  FROM media_placements mp JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
  WHERE mp.site_id = s.id AND mp.owner_type = 'site' AND mp.owner_id = s.id AND mp.status = 'active'
  ORDER BY mp.slot, mp.sort_order, mp.id
) ordered)`

// KrabiClaw's own site is the one active site running the platform template.
// Platform hosts differ per environment (localhost, preview, staging, the apex),
// so the host itself is not the key; the template is.
async function resolvePlatformSite(db: DbClient): Promise<TenantSiteRow | null> {
  return await queryFirst<TenantSiteRow>(
    db,
    `
      SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status,
             canonical.domain AS canonical_domain,
             s.brand_name, ${SITE_MEDIA_SELECT_SQL} AS media_json, s.vertical
      FROM sites s
      LEFT JOIN site_domains canonical
        ON canonical.site_id = s.id AND canonical.role = 'canonical' AND canonical.status = 'active'
      WHERE s.theme_id = ? AND s.status = 'active' AND s.onboarding_status = 'active'
      LIMIT 1
    `,
    [PLATFORM_TEMPLATE.themeId],
  )
}

function publicTenantSiteMedia(site: Pick<TenantSiteRow, 'media_json'>) {
  return publicSocialMediaFromJson(site.media_json)
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
  tenantSlug: string,
): Promise<TenantSiteRow | null> {
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
      WHERE s.subdomain = ? AND s.status = 'active'
      LIMIT 1
    `,
    [tenantSlug],
  )
}

/**
 * A site that has not finished onboarding is not public. It is served only to a
 * holder of a valid preview token for that site — which is what "preview" means
 * everywhere in this product: the real site, on its real host, rendered by the
 * real templates, with unpublished content and no caching.
 *
 * Returns false when the request may not see this site at all.
 */
async function authorizeTenantSite(event: H3Event, site: TenantSiteRow): Promise<boolean> {
  const previewSecret = previewSecretOf(cloudflareEnv(event))
  const authorized = await resolvePreviewAuthorization(event, site.id, previewSecret)
  event.context.previewAuthorized = authorized
  // A live site is public either way; the flag still travels, because preview
  // also means "show me the drafts" — an unpublished article on a site that is
  // already live is previewed the same way.
  return site.onboarding_status === 'active' || authorized
}

function setResolvedTenantContext(
  event: H3Event,
  site: TenantSiteRow,
  host: string,
  canonicalDomain: string | null,
) {
  const metadata = requireTenantMetadata(site, site.id)
  const socialMedia = publicTenantSiteMedia(site)
  event.context.siteId = site.id
  event.context.organizationId = site.organization_id
  event.context.themeId = metadata.themeId
  event.context.onboardingStatus = site.onboarding_status
  setTenantType(event, resolvePublicTemplate({ themeId: metadata.themeId }).slug === 'platform' ? TENANT_TYPES.PLATFORM : TENANT_TYPES.TENANT)
  event.context.tenantHost = hostnameOf(host)
  event.context.canonicalDomain = canonicalDomain
  event.context.site = {
    brand_name: metadata.brandName,
    ...socialMedia,
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
  if (tenantPath === "/api/auth" || tenantPath.startsWith("/api/auth/")) return;
  // Public site APIs carry an explicit site ID and resolve that site through
  // their canonical service. Host-based tenant resolution would duplicate the
  // same database lookup without adding an authorization boundary.
  if (tenantPath.startsWith("/api/public/sites/")) return;
  const host = (event.req.headers.get("host")) || "";
  const env = cloudflareEnv(event);

  // Local and raw workers.dev hosts cannot express tenant identity in their
  // hostname, so their test harness carries it explicitly. Deployed preview and
  // staging use direct environment aliases below.
  const previewSlug = usesTenantHeader(host) ? event.req.headers.get("x-preview-tenant") : null
  if (previewSlug !== null) {
    // The header names a tenant, so this request is that tenant's or it is
    // nothing. Falling through on an unresolvable slug reached the platform-host
    // branch below and answered 200 with KrabiClaw's own homepage — a request
    // for one site served a different site. Same refusal as an environment
    // alias that does not resolve.
    const site = env.db && /^[a-z0-9-]+$/.test(previewSlug)
      ? await resolveRegisteredSubdomainSite(env.db, previewSlug)
      : null
    if (site && await authorizeTenantSite(event, site)) {
      setResolvedTenantContext(event, site, host, hostnameOf(host))
      return;
    }
    setTenantType(event, TENANT_TYPES.TENANT_404)
    event.context.siteId = null
    return
  }

  const aliasSlug = environmentTenantAliasSlug(host, env)
  if (aliasSlug) {
    const site = env.db
      ? await resolveRegisteredSubdomainSite(env.db, aliasSlug)
      : null
    if (site && await authorizeTenantSite(event, site)) {
      setResolvedTenantContext(event, site, host, hostnameOf(host))
      return
    }
    setTenantType(event, TENANT_TYPES.TENANT_404)
    event.context.siteId = null
    return
  }

  // A platform host serves KrabiClaw's own site. Tenant hosts own their public
  // route families.
  if (isPlatformHost(host, env)) {
    const site = env.db ? await resolvePlatformSite(env.db) : null
    if (!site) {
      throw new HTTPError({ statusCode: 500, statusMessage: 'No active site runs the platform template', data: { code: 'PLATFORM_SITE_MISSING' } })
    }
    setResolvedTenantContext(event, site, host, site.canonical_domain)
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

  if (site && await authorizeTenantSite(event, site)) {
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
      AND s.status = 'active'
    LIMIT 1
  `,
    [hostname],
  )
  if (site) return site

  const spent = await queryFirst<{ successor_domain: string | null }>(
    db,
    "SELECT successor_domain FROM site_domains WHERE domain = ? AND status = 'retired' LIMIT 1",
    [hostname],
  )
  return spent
    ? { spent: true, successorDomain: spent.successor_domain }
    : null
}
