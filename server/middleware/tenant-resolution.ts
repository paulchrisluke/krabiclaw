// Tenant resolution middleware for KrabiClaw SaaS
// Determines if request is for platform or tenant site

import { defineEventHandler, getRequestURL, getHeader, type H3Event } from "h3";
import { queryFirst } from "~/server/db";
import { TENANT_TYPES, type TenantType } from "~/utils/tenant-routing";
import { cloudflareEnv, isInternalSelfFetch } from "../utils/api-response";
import {
  deriveSubdomain,
  getFreeSiteDomain,
  hostnameOf,
  isPlatformHost,
  isPreviewContext,
} from "../utils/tenant-hosts";
import { verifyScopedPreviewToken } from "../utils/preview-token";
import { isPlatformPath } from "~/utils/platform-routes";

interface TenantResolutionEnv {
  NUXT_PUBLIC_FREE_SITE_DOMAIN?: string;
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string;
}

interface TenantSiteRow {
  id: string;
  organization_id: string;
  theme_id: string | null;
  subdomain: string;
  onboarding_status: string;
  canonical_domain: string | null;
  brand_name: string | null;
  logo_url: string | null;
  vertical: string | null;
  redirect_to_path: string | null;
  redirect_status_code: number | null;
  redirect_behavior: string | null;
}

function setTenantType(event: H3Event, tenantType: TenantType) {
  event.context.tenantType = tenantType;
}

function setTenantRedirect(event: H3Event, site: TenantSiteRow) {
  event.context.tenantRedirect = site.redirect_behavior
    ? {
        toPath: site.redirect_to_path,
        statusCode: site.redirect_status_code,
        behavior: site.redirect_behavior,
      }
    : null;
}

function normalizedPath(pathname: string) {
  return pathname === "/" ? "/" : pathname.replace(/\/$/, "");
}

export default defineEventHandler(async (event) => {
  // Nested self-fetches (i18n/icon/internal API calls during SSR) never carry
  // tenant context downstream handlers rely on — the real inbound request
  // already resolved tenant type/host before triggering these. Skip the DB
  // lookup and host parsing entirely rather than redoing it per phantom request.
  if (isInternalSelfFetch(event)) return;

  const url = getRequestURL(event);
  const tenantPath = normalizedPath(url.pathname);
  const host = getHeader(event, "host") || "";
  const env = cloudflareEnv(event);

  // Preview E2E: allow tests running against *.workers.dev preview Workers to
  // specify tenant via x-preview-tenant header. Only trusted for workers.dev
  // hosts — production custom domains never match this path.
  if (isPreviewContext(host)) {
    const previewSlug = getHeader(event, "x-preview-tenant");
    if (previewSlug && /^[a-z0-9-]+$/.test(previewSlug)) {
      // Look up by subdomain directly — freeSiteDomain differs between staging/preview/production,
      // so constructing `${slug}.${freeSiteDomain}` would produce 'pottery-house.staging.krabiclaw.com'
      // in staging but site_domains only stores 'pottery-house.krabiclaw.com'.
      const db = env.db;
      if (db) {
        const site = await queryFirst<TenantSiteRow>(
          db,
          `
          SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status,
                 canonical.domain AS canonical_domain,
                 s.brand_name, COALESCE(ma.public_url, s.logo_url) AS logo_url, s.vertical,
                 redirect_rule.to_path AS redirect_to_path,
                 redirect_rule.status_code AS redirect_status_code,
                 redirect_rule.behavior AS redirect_behavior
          FROM sites s
          LEFT JOIN site_domains canonical
            ON canonical.site_id = s.id
           AND canonical.type = 'subdomain'
           AND canonical.role = 'canonical'
           AND canonical.status = 'active'
          LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
          LEFT JOIN tenant_redirects redirect_rule
            ON redirect_rule.site_id = s.id AND redirect_rule.from_path = ?
          WHERE s.subdomain = ? AND s.status = 'active' AND s.onboarding_status = 'active'
          LIMIT 1
        `,
          [tenantPath, previewSlug],
        );
        if (site) {
          event.context.siteId = site.id;
          event.context.organizationId = site.organization_id;
          event.context.themeId = site.theme_id;
          event.context.onboardingStatus = site.onboarding_status;
          setTenantType(event, TENANT_TYPES.TENANT);
          event.context.tenantHost = host.split(":")[0];
          // Preview/staging tenant access intentionally stays on the current
          // host because nested tenant subdomains are unavailable there. If we
          // carry through the DB canonical domain, tenant-routing can 301 to a
          // localhost or production tenant host and break CI navigation.
          event.context.canonicalDomain = host.split(":")[0];
          setTenantRedirect(event, site);
          event.context.site = {
            brand_name: site.brand_name || null,
            logo_url: site.logo_url || null,
            vertical: site.vertical || "restaurant",
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
          | "vertical"
        >
      >(
        db,
        `
        SELECT s.id, s.organization_id, s.theme_id, s.onboarding_status, s.brand_name,
               COALESCE(ma.public_url, s.logo_url) AS logo_url, s.vertical
        FROM sites s
        LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
        WHERE s.id = ? AND s.status = 'active'
        LIMIT 1
      `,
        [previewSiteId],
      );
      if (previewSite) {
        event.context.siteId = previewSite.id;
        event.context.organizationId = previewSite.organization_id;
        event.context.themeId = previewSite.theme_id;
        event.context.onboardingStatus = previewSite.onboarding_status;
        setTenantType(event, TENANT_TYPES.TENANT);
        event.context.site = {
          brand_name: previewSite.brand_name || null,
          logo_url: previewSite.logo_url || null,
          vertical: previewSite.vertical || "restaurant",
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
          event.context.draftId = previewDraft.id;
          setTenantType(event, TENANT_TYPES.TENANT);
          event.context.themeId = "saya-theme-v1";
          event.context.site = {
            brand_name: previewDraft.name || null,
            logo_url: null,
            vertical: previewDraft.vertical || "restaurant",
          };
          return;
        }
      }
    }
  }

  const isPlatform = isPlatformHost(host, env);

  // Normal requests resolve platform-vs-tenant by host, not by pathname.
  // Tenant sites legitimately own routes like /experiences, /reservations,
  // /locations, /menu, and /contact on their custom domains. Treating those
  // path prefixes as platform globally causes SSR on tenant hosts to
  // serialize a platform context (siteId=null), which is exactly how
  // www.potteryhousekrabi.com/experiences ended up rendering the KrabiClaw
  // empty-state page while the tenant bootstrap API still returned real
  // experience data. isPlatformPath() stays in use above for preview-route
  // guards on true platform hosts.
  if (isPlatform) {
    setTenantType(event, TENANT_TYPES.PLATFORM);
    event.context.siteId = null;
    return;
  }

  // Tenant site resolution
  const site = await resolveTenantSite(host, event);

  // If site found, handle based on onboarding status
  if (site) {
    event.context.siteId = site.id;
    event.context.organizationId = site.organization_id;
    event.context.themeId = site.theme_id;
    event.context.onboardingStatus = site.onboarding_status;
    setTenantType(event, TENANT_TYPES.TENANT);
    event.context.tenantHost = host.split(":")[0];
    event.context.canonicalDomain = site.canonical_domain || null;
    setTenantRedirect(event, site);
    event.context.site = {
      brand_name: site.brand_name || null,
      logo_url: site.logo_url || null,
      vertical: site.vertical || "restaurant",
    };
    return;
  }

  // No tenant found - this is an unknown subdomain/custom domain
  setTenantType(event, TENANT_TYPES.TENANT_404);
  event.context.siteId = null;
});

async function resolveTenantSite(
  host: string,
  event: Parameters<typeof cloudflareEnv>[0],
): Promise<TenantSiteRow | null> {
  const runtimeEnv = cloudflareEnv(event);
  const env = runtimeEnv as TenantResolutionEnv;
  const db = runtimeEnv.db;
  const hostname = hostnameOf(host);
  const tenantPath = normalizedPath(getRequestURL(event).pathname);

  if (!db || !hostname) return null;

  // Local development support (e.g., demo.localhost)
  if (hostname.includes(".localhost")) {
    const subdomain = hostname.split(".")[0];
    return await queryFirst<TenantSiteRow>(
      db,
      `
      SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status,
             s.subdomain || '.localhost' AS canonical_domain,
             s.brand_name, COALESCE(ma.public_url, s.logo_url) AS logo_url, s.vertical,
             redirect_rule.to_path AS redirect_to_path,
             redirect_rule.status_code AS redirect_status_code,
             redirect_rule.behavior AS redirect_behavior
      FROM sites s
      LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
      LEFT JOIN tenant_redirects redirect_rule
        ON redirect_rule.site_id = s.id AND redirect_rule.from_path = ?
      WHERE s.subdomain = ? AND s.status = 'active'
      LIMIT 1
    `,
      [tenantPath, subdomain],
    );
  }

  // Try custom domains first (from site_domains table)
  const customDomainSite = await queryFirst<TenantSiteRow>(
    db,
    `
    SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status, sd.domain,
           COALESCE(canonical.domain, sd.domain) AS canonical_domain,
           s.brand_name, COALESCE(ma.public_url, s.logo_url) AS logo_url, s.vertical,
           redirect_rule.to_path AS redirect_to_path,
           redirect_rule.status_code AS redirect_status_code,
           redirect_rule.behavior AS redirect_behavior
    FROM sites s
    JOIN site_domains sd ON s.id = sd.site_id
    LEFT JOIN site_domains canonical
      ON canonical.site_id = s.id AND canonical.role = 'canonical' AND canonical.status = 'active'
    LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
    LEFT JOIN tenant_redirects redirect_rule
      ON redirect_rule.site_id = s.id AND redirect_rule.from_path = ?
    WHERE sd.domain = ? AND sd.type = 'custom' AND sd.status = 'active'
      AND s.status = 'active' AND s.onboarding_status = 'active'
    LIMIT 1
  `,
    [tenantPath, hostname],
  );

  if (customDomainSite) return customDomainSite;

  // Try subdomains
  const platformDomain = getFreeSiteDomain(env);
  const isPlatformSubdomainHost =
    hostname !== "localhost" &&
    hostname !== platformDomain &&
    hostname.endsWith(`.${platformDomain}`);

  if (isPlatformSubdomainHost) {
    const subdomain = deriveSubdomain(hostname, platformDomain);
    if (!subdomain) return null;

    const subdomainSite = await queryFirst<TenantSiteRow>(
      db,
      `
      SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status, sd.domain,
             COALESCE(canonical.domain, sd.domain) AS canonical_domain,
             s.brand_name, COALESCE(ma.public_url, s.logo_url) AS logo_url, s.vertical,
             redirect_rule.to_path AS redirect_to_path,
             redirect_rule.status_code AS redirect_status_code,
             redirect_rule.behavior AS redirect_behavior
      FROM sites s
      JOIN site_domains sd ON s.id = sd.site_id
      LEFT JOIN site_domains canonical
        ON canonical.site_id = s.id AND canonical.role = 'canonical' AND canonical.status = 'active'
      LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
      LEFT JOIN tenant_redirects redirect_rule
        ON redirect_rule.site_id = s.id AND redirect_rule.from_path = ?
      WHERE sd.domain = ? AND sd.type = 'subdomain' AND sd.status = 'active'
        AND s.status = 'active' AND s.onboarding_status = 'active'
      LIMIT 1
    `,
      [tenantPath, `${subdomain}.${platformDomain}`],
    );

    if (subdomainSite) return subdomainSite;

    // Fallback for sites that predate site_domains population — resolve by sites.subdomain directly.
    // This keeps existing sites live until site_domains records are seeded.
    return await queryFirst<TenantSiteRow>(
      db,
      `
      SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status,
             ? AS canonical_domain,
             s.brand_name, COALESCE(ma.public_url, s.logo_url) AS logo_url, s.vertical,
             redirect_rule.to_path AS redirect_to_path,
             redirect_rule.status_code AS redirect_status_code,
             redirect_rule.behavior AS redirect_behavior
      FROM sites s
      LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
      LEFT JOIN tenant_redirects redirect_rule
        ON redirect_rule.site_id = s.id AND redirect_rule.from_path = ?
      WHERE s.subdomain = ? AND s.status = 'active' AND s.onboarding_status = 'active'
      LIMIT 1
    `,
      [hostname, tenantPath, subdomain],
    );
  }

  return null;
}
