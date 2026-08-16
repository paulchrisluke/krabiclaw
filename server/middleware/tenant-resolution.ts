// Tenant resolution middleware for KrabiClaw SaaS
// Determines if request is for platform or tenant site

import { HTTPError, defineHandler  } from 'nitro';
import type { H3Event } from 'nitro';
import { } from 'nitro/h3';
import { queryFirst } from "~/server/db";
import { TENANT_TYPES, type TenantType } from "~/utils/tenant-routing";
import { cloudflareEnv, isInternalSelfFetch } from "../utils/api-response";
import {
  getFreeSiteDomain,
  hostnameOf,
  isPlatformHost,
  isPreviewContext,
} from "../utils/tenant-hosts";
import { verifyScopedPreviewToken } from "../utils/preview-token";
import { isPlatformPath } from "~/utils/platform-routes";
import { parseOnboardingDraftPayload } from "~/server/utils/onboarding-drafts";
import { resolvePublicTemplate } from "~/utils/template-registry";

interface TenantSiteRow {
  id: string;
  organization_id: string;
  theme_id: string | null;
  subdomain: string;
  onboarding_status: string;
  canonical_domain: string | null;
  brand_name: string | null;
  logo_url: string | null;
  logo_mime_type: string | null;
  favicon_url: string | null;
  vertical: string | null;
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

  // Shared local, preview, and staging hosts carry tenant identity in a header.
  // Production custom domains never match this host boundary.
  if (isPreviewContext(host)) {
    const previewSlug = (event.req.headers.get("x-preview-tenant"));
    if (previewSlug && /^[a-z0-9-]+$/.test(previewSlug)) {
      const db = env.db;
      if (db) {
        const tenantDomain = `${previewSlug}.${getFreeSiteDomain(env)}`;
        const site = await queryFirst<TenantSiteRow>(
          db,
          `
          SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status,
                 canonical.domain AS canonical_domain,
                 s.brand_name, COALESCE(ma.public_url, s.logo_url) AS logo_url,
                 ma.mime_type AS logo_mime_type,
                 json_extract(s.settings, '$.favicon_url') AS favicon_url, s.vertical
          FROM sites s
          JOIN site_domains requested
            ON requested.site_id = s.id
           AND requested.type = 'subdomain'
           AND requested.status = 'active'
          LEFT JOIN site_domains canonical
            ON canonical.site_id = s.id
           AND canonical.role = 'canonical'
           AND canonical.status = 'active'
          LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
          WHERE requested.domain = ? AND s.status = 'active' AND s.onboarding_status = 'active'
          LIMIT 1
        `,
          [tenantDomain],
        );
        if (site) {
          const metadata = requireTenantMetadata(site, site.id)
          event.context.siteId = site.id;
          event.context.organizationId = site.organization_id;
          event.context.themeId = metadata.themeId;
          event.context.onboardingStatus = site.onboarding_status;
          setTenantType(event, TENANT_TYPES.TENANT);
          event.context.tenantHost = host.split(":")[0];
          // Preview/staging tenant access intentionally stays on the current
          // host because nested tenant subdomains are unavailable there. If we
          // carry through the DB canonical domain, tenant-routing can 301 to a
          // localhost or production tenant host and break CI navigation.
          event.context.canonicalDomain = host.split(":")[0];
          event.context.site = {
            brand_name: metadata.brandName,
            logo_url: site.logo_url || null,
            logo_mime_type: site.logo_mime_type || null,
            favicon_url: site.favicon_url || null,
            vertical: metadata.vertical,
          };
          return;
        }
      }
    }
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
          | "logo_url"
          | "logo_mime_type"
          | "favicon_url"
          | "vertical"
        >
      >(
        db,
        `
        SELECT s.id, s.organization_id, s.theme_id, s.onboarding_status, s.brand_name,
               COALESCE(ma.public_url, s.logo_url) AS logo_url,
               ma.mime_type AS logo_mime_type,
               json_extract(s.settings, '$.favicon_url') AS favicon_url, s.vertical
        FROM sites s
        LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
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
          logo_url: previewSite.logo_url || null,
          logo_mime_type: previewSite.logo_mime_type || null,
          favicon_url: previewSite.favicon_url || null,
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
            logo_url: payload.preview.config.logo_url || null,
            favicon_url: null,
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
    return;
  }

  // Tenant site resolution
  const site = await resolveTenantSite(host, event);

  // If site found, handle based on onboarding status
  if (site) {
    const metadata = requireTenantMetadata(site, site.id)
    event.context.siteId = site.id;
    event.context.organizationId = site.organization_id;
    event.context.themeId = metadata.themeId;
    event.context.onboardingStatus = site.onboarding_status;
    setTenantType(event, TENANT_TYPES.TENANT);
    event.context.tenantHost = host.split(":")[0];
    event.context.canonicalDomain = site.canonical_domain || null;
    event.context.site = {
      brand_name: metadata.brandName,
      logo_url: site.logo_url || null,
      logo_mime_type: site.logo_mime_type || null,
      favicon_url: site.favicon_url || null,
      vertical: metadata.vertical,
    };
    return;
  }

  // No tenant found - this is an unknown subdomain/custom domain
  setTenantType(event, TENANT_TYPES.TENANT_404);
  event.context.siteId = null;
});

export async function resolveTenantSite(
  host: string,
  event: Parameters<typeof cloudflareEnv>[0],
): Promise<TenantSiteRow | null> {
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
             s.brand_name, COALESCE(ma.public_url, s.logo_url) AS logo_url,
             ma.mime_type AS logo_mime_type,
             json_extract(s.settings, '$.favicon_url') AS favicon_url, s.vertical
      FROM sites s
      LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
      WHERE s.subdomain = ? AND s.status = 'active'
      LIMIT 1
    `,
      [subdomain],
    );
  }

  return (await queryFirst<TenantSiteRow>(
    db,
    `
    SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status, sd.domain,
           COALESCE(canonical.domain, sd.domain) AS canonical_domain,
           s.brand_name, COALESCE(ma.public_url, s.logo_url) AS logo_url,
           ma.mime_type AS logo_mime_type,
           json_extract(s.settings, '$.favicon_url') AS favicon_url, s.vertical
    FROM sites s
    JOIN site_domains sd ON s.id = sd.site_id
    LEFT JOIN site_domains canonical
      ON canonical.site_id = s.id AND canonical.role = 'canonical' AND canonical.status = 'active'
    LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
    WHERE sd.domain = ? AND sd.type IN ('custom', 'subdomain') AND sd.status = 'active'
      AND s.status = 'active' AND s.onboarding_status = 'active'
    LIMIT 1
  `,
    [hostname],
  )) ?? null;
}
