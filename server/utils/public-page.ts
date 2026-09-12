import { parseOpeningHours, parseSpecialHours } from '~/shared/reservation-hours'
import { parseGoogleReviewMetadata } from '~/shared/google-review'
// Canonical route-capability-driven public page service.
//   ?page=home|about|contact|location|reviews|photos|qa|...
//   ?location=slug          scope content to a location
//   ?datasets=content,products   include only the named route capabilities
// All inline D1 queries run in a single executeBatch() call.
import { executeBatch, queryFirst, type BatchQuery } from "~/server/db";
import { HTTPError, type H3Event } from 'nitro';
import {  setHeader } from 'nitro/h3';
import { cloudflareEnv } from "~/server/utils/api-response";
import { calculateMapEmbedUrl } from "~/server/utils/google-places";
import {
  buildPublicReviewAggregate,
  normalizePublicReviewAggregateRows,
} from "~/server/utils/public-review-aggregate";
import { getPublicTenantPageForPath, type PublicTenantPage } from "~/server/utils/public-tenant-pages";
import { listCollections, listSiteProducts } from '~/server/utils/product-management'
import { previewSecretOf, resolvePreviewAuthorization } from "~/server/utils/preview-token";
import {
  toResolvedMediaAsset,
  type MediaAsset,
} from "~/server/utils/media-asset-manager";
import { getMediaPlacements } from '~/server/utils/media-placement'
import type { Collection, Product } from '~/server/types/products'
import { resolveSiteCmsCapabilities } from '~/server/utils/cms-capabilities'
import { attachCover } from "~/server/utils/content/publishing";
import { COVER_SELECT, coverJoinSql } from "~/server/utils/content/cover";
import { getContentBlocksForDocument } from '~/server/utils/content/documents'
import {
  buildPublicResourceCacheKey,
  getPublicResourceCache,
  putPublicResourceCache,
} from "~/server/utils/public-resource-cache";
import { recordRequestPhase } from "~/server/utils/request-metrics";
import { getCloudflareWaitUntil } from "~/server/utils/mcp-route-helpers";
import { isNonProductionHost } from "~/server/utils/tenant-hosts";
import { getPublishedPosts } from "~/server/utils/post-management";
import { loadPublicBase } from "~/server/utils/public-base";
import { appendPublicShellQueries, buildPublicShellPayload } from "~/server/utils/public-shell-query";
import { isPublicPagePayload } from '~/utils/public-resource-contracts'
import type { LocalizedResourceType } from '~/server/utils/localization-registry'
import { listPublicLocaleRepresentations } from '~/server/utils/public-locale-representations'
import { normalizeVertical } from '~/utils/vertical-copy'
import { isPublicSourceRouteRoot } from '~/shared/public-locale-routes'
import {
  loadExactPublicLocalizations,
  projectExactLocalizedCollection,
  projectExactLocalizedResource,
  projectLocalizedMediaAlt,
  resolveLocalizedRouteResourceId,
  type ExactPublicLocalization,
} from '~/server/utils/public-localization'

interface SiteContent {
  id: string
  organization_id: string
  site_id: string
  location_id?: string
  page: string
  field: string
  value?: string
  type: string
  source: string
  content?: string
  hero_title?: string | null
  hero_subtitle?: string | null
  media?: Array<{ asset_id: string; slot: string; public_url?: string | null; thumbnail_url?: string | null; kind?: string | null }>
  updated_at: string
}

function groupContentBlocks(rows: SiteContent[]): Array<SiteContent & { _section: string }> {
  const groups = Object.create(null) as Record<string, SiteContent & { _section: string }>
  for (const row of rows) {
    const section = row.field?.split('.')[0] || 'unknown'
    if (!groups[section]) {
      groups[section] = { ...row, field: section, _section: section }
    } else {
      for (const key of Object.keys(row) as Array<keyof SiteContent>) {
        if (groups[section][key] == null) (groups[section] as unknown as Record<string, unknown>)[key] = row[key]
      }
    }
  }
  return Object.values(groups)
}

const PUBLIC_PHOTO_CATEGORY: Record<string, string> = {
  exterior: "EXTERIOR",
  interior: "INTERIOR",
  food: "FOOD",
  menu: "MENU",
  team: "TEAM",
  other: "OTHER",
};

// Typed row shapes — column names must match the SELECT exactly
interface ReviewRow {
  id: string;
  author_name: string | null;
  rating: number;
  title: string | null;
  content: string | null;
  owner_reply: string | null;
  owner_reply_at: string | null;
  source: string | null;
  original_review_date: string | null;
  original_reference: string | null;
  google_review_metadata: string | null;
  created_at: string | null;
}





type ProductMediaRow = MediaAsset & { product_id: string; slot: 'image' | 'gallery'; sort_order: number };

const publicPageReadsByRequest = new WeakMap<H3Event, Map<string, Promise<unknown>>>()

interface PublicPageLoadOptions {
  mutateResponseHeaders?: boolean
  signal?: AbortSignal
}

function canonicalTenantPagePath(page: string | null): string | null {
  if (!page) return null
  if (page === 'home') return '/'
  // Location detail routes are backed by the canonical business_locations row
  // and their route datasets. They are not tenant-page variants, so do not
  // require a CMS page record for a valid location.
  if (page === 'locations') return '/locations'
  if (isPublicSourceRouteRoot(page)) return `/${page}`
  return null
}

function tenantPageToContentRows(page: PublicTenantPage): SiteContent[] {
  const rows: SiteContent[] = []
  for (const block of page.blocks) {
    const data = block.data
    const field = typeof data.field === 'string' && data.field.trim()
      ? data.field.trim()
      : `${block.type}.${block.position}`
    const base = {
      id: block.id,
      organization_id: '',
      site_id: '',
      page: page.path === '/' ? 'home' : page.path.slice(1).replaceAll('/', '-'),
      field,
      type: block.type === 'image' || block.type === 'gallery' ? 'media' : 'text',
      source: 'tenant-pages',
      updated_at: page.updated_at,
      media: block.media,
    } satisfies SiteContent
    if (block.type === 'hero') {
      rows.push({
        ...base,
        field: 'hero',
        content: typeof data.eyebrow === 'string' ? data.eyebrow : undefined,
        hero_title: typeof data.title === 'string' ? data.title : null,
        hero_subtitle: typeof data.subtitle === 'string' ? data.subtitle : null,
      })
      if (typeof data.eyebrow === 'string' && data.eyebrow.trim()) rows.push({ ...base, field: 'hero.kicker', content: data.eyebrow })
      continue
    }
    if (block.type === 'heading') {
      rows.push({ ...base, field, content: typeof data.text === 'string' ? data.text : undefined })
      continue
    }
    if (block.type === 'markdown') {
      rows.push({ ...base, content: typeof data.markdown === 'string' ? data.markdown : typeof data.content === 'string' ? data.content : undefined })
      continue
    }
    rows.push({ ...base, content: typeof data.title === 'string' ? data.title : undefined })
  }
  return rows
}



async function loadPublicPageSource(
  event: H3Event,
  siteId: string,
  query: Record<string, string | undefined>,
  options: PublicPageLoadOptions = {},
) {
  options.signal?.throwIfAborted();
  const mutateResponseHeaders = options.mutateResponseHeaders ?? true;
  const env = cloudflareEnv(event);
  const db = env.DB;
  if (!db) throw new HTTPError({ statusCode: 503, statusMessage: "Database unavailable" });

  const isPreviewAuthorized = await resolvePreviewAuthorization(event, siteId, previewSecretOf(env));
  options.signal?.throwIfAborted();

  if (mutateResponseHeaders) {
    setHeader(
      event,
      "cache-control",
      isPreviewAuthorized
        ? "private, no-store"
        : "public, max-age=60, stale-while-revalidate=300",
    );
  }
  const page = typeof query.page === "string" ? query.page : null;
  const locationSlug =
    typeof query.location === "string" ? query.location : null;
  const requestedDatasets = new Set(
    typeof query.datasets === "string" && query.datasets
      ? query.datasets.split(",")
      : [],
  );
  const includeProducts = requestedDatasets.has('products');
  const blogSlug = typeof query.blogSlug === "string" ? query.blogSlug : null;
  const locale = typeof query.locale === "string" ? query.locale : undefined;

  // Validate query inputs before using KV cache — only allow known-safe values
  // to prevent unbounded cache entries from arbitrary variants.
  const VALID_DATASETS = new Set([
    'content', 'location', 'products', 'reviews', 'photos', 'qa', 'posts',
    'blog', 'blogPost', 'reservationPolicies',
  ]);
  // Mirrors composables/usePublicPageRequest.ts's getPublicPageRequest() — the only
  // page values the frontend ever requests. A regex alone (e.g. /^[a-z0-9_-]+$/)
  // would still let an attacker mint unlimited distinct cache keys by varying
  // the page value; allowlisting against the real route set bounds that space.
  const VALID_PAGES = new Set([
    'home', 'locations', 'location', 'about', 'contact', 'reservations',
    'order', 'qa', 'reviews', 'posts', 'photos', 'menu', 'products', 'blog',
  ]);
  const areDatasetsValid = [...requestedDatasets].every(dataset => VALID_DATASETS.has(dataset));
  const isValidLocale = locale === undefined || /^[a-z]{2}(-[A-Z]{2})?$/.test(locale);
  const isValidPage = page === null || VALID_PAGES.has(page);
  // locationSlug/blogSlug can't be allowlisted up front — they're
  // arbitrary per-tenant slugs resolved against D1. The regex here only bounds
  // the character set for a cheap pre-DB shape check; the actual cache *write*
  // below is additionally gated on the slug having resolved to a real row, so
  // slugs that don't correspond to an existing entity never populate the cache.
  const isValidLocation = locationSlug === null || /^[a-z0-9_-]+$/.test(locationSlug);
  const isValidBlogSlug = blogSlug === null || /^[a-z0-9_-]+$/.test(blogSlug);

  const allInputsValid = areDatasetsValid && isValidLocale && isValidPage &&
    isValidLocation && isValidBlogSlug;
  if (!allInputsValid) {
    throw new HTTPError({ statusCode: 400, statusMessage: "Invalid public page query" });
  }

  // Read-through KV cache for the D1 batch below. Skipped for preview-authorized
  // requests (isPreviewAuthorized gates the whole read/write, not just the key —
  // omitting the token from the key alone would let a preview response collide
  // with the public cache entry for the same page/location) and for preview/staging
  // hosts, whose D1 gets reseeded on every CI push —
  // a 60s-old cached response could serve pre-reseed content into a fresh E2E run.
  // Also skipped if any query input is invalid to prevent unbounded cache entries.
  const host = (event.req.headers.get("host")) ?? "";
  const usePageCache = !isPreviewAuthorized && !isNonProductionHost(host) && allInputsValid;
  const cacheKey = buildPublicResourceCacheKey(siteId, {
    contract: 'page',
    page,
    location: locationSlug,
    datasets: [...requestedDatasets],
    blogSlug,
    locale,
  });
  if (usePageCache) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kv = (env as any).SITE_CACHE as KVNamespace | undefined;
    if (kv) {
      const cacheStartedAt = performance.now();
      const cached = await getPublicResourceCache(kv, cacheKey);
      recordRequestPhase(event, "cache", cacheStartedAt);
      options.signal?.throwIfAborted();
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as unknown;
          if (!isPublicPagePayload(parsed, page ?? 'home')) {
            throw new Error("Page cache contract mismatch");
          }
          if (mutateResponseHeaders) setHeader(event, "x-bootstrap-cache", "HIT");
          return parsed;
        } catch (error) {
          console.warn("[public-resource-cache] corrupt page entry", {
            siteId,
            error: error instanceof Error ? error.message : String(error),
          });
          const deletion = kv.delete(cacheKey).catch((deleteError: unknown) => {
            console.warn("[public-resource-cache] corrupt page deletion failed", {
              siteId,
              error: String(deleteError),
            });
          });
          getCloudflareWaitUntil(event)?.(deletion);
        }
      }
      if (mutateResponseHeaders) setHeader(event, "x-bootstrap-cache", "MISS");
    } else {
      if (mutateResponseHeaders) setHeader(event, "x-bootstrap-cache", "NO-KV");
    }
  } else {
    if (mutateResponseHeaders) setHeader(event, "x-bootstrap-cache", "SKIP");
  }

  const { site } = await loadPublicBase(event, siteId, { previewAuthorized: isPreviewAuthorized });
  options.signal?.throwIfAborted();

  const orgId = site.organization_id;
  const localizedLocale = locale && locale !== 'en' ? locale : null
  let publicLocalizations: ExactPublicLocalization[] = []
  if (localizedLocale) {
    publicLocalizations = await loadExactPublicLocalizations(db, orgId, siteId, localizedLocale)
  }

  const localizedLocationId = localizedLocale && locationSlug
    ? resolveLocalizedRouteResourceId(publicLocalizations, 'business_location', `/${localizedLocale}/locations/${locationSlug}`)
    : null
  if (localizedLocale && locationSlug && !localizedLocationId) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Localized location was not found' })
  }
  const locationRow = locationSlug
    ? await queryFirst<{ id: string }>(
        db,
        localizedLocationId
          ? `SELECT id FROM business_locations WHERE site_id = ? AND id = ? AND status = 'active' LIMIT 1`
          : `SELECT id FROM business_locations WHERE site_id = ? AND slug = ? AND status = 'active' LIMIT 1`,
        [siteId, localizedLocationId ?? locationSlug],
      )
    : null
  const locationId = locationRow?.id;

  const normalizedVertical = normalizeVertical(site.vertical)
  const localizedBlogPost = localizedLocale && blogSlug ? await queryFirst<{ id: string }>(db,
    `SELECT id FROM content_documents WHERE site_id = ? AND kind = 'article' AND row_role = 'representation'
      AND locale = ? AND path = ? LIMIT 1`, [siteId, localizedLocale, '/' + (normalizedVertical === 'service' ? 'article' : 'blog') + '/' + blogSlug]) : null
  const localizedBlogPostId = localizedBlogPost?.id ?? null
  if (localizedLocale && blogSlug && !localizedBlogPostId) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Localized blog post was not found' })
  }

  // Pages that render the sitewide reviews list
  const needsGlobalReviews =
    requestedDatasets.has("reviews") && !locationSlug;
  // Pages that render the posts feed
  const needsGlobalPosts = requestedDatasets.has("posts") && !locationSlug;
  // Pages that display location hero images (cards or detail header)
  const needsLocations =
    requestedDatasets.has("reviews") ||
    requestedDatasets.has("location") ||
    requestedDatasets.has('products') ||
    requestedDatasets.has("reservationPolicies");

  // Build batch — one subrequest to D1 for all inline queries
  const batchStmts: BatchQuery[] = [];
  let idxLoc = -1;
  let idxReviews = -1,
    idxLocReviews = -1;
  let idxFullReviews = -1,
    idxReviewAggregate = -1,
    idxPhotos = -1,
    idxQa = -1;
  let idxProducts = -1, idxProductMedia = -1;

  let idxBlogList = -1,
    idxBlogPost = -1;

  const push = (q: string, params: unknown[]) => {
    const i = batchStmts.length;
    batchStmts.push({ query: q, params });
    return i;
  };

  const shellIndexes = appendPublicShellQueries(batchStmts, orgId, siteId);
  if (needsLocations) idxLoc = shellIndexes.locations;

  if (includeProducts) {
    // Root rows only, and only what this site publishes at a location that is
    // still offering them. The relationships hanging off each product are
    // hydrated by the canonical reader below — this query does not try to
    // flatten variants, prices and collections into one row set.
    const productParams: unknown[] = locationSlug
      ? [siteId, locationId ?? '__missing-location__', orgId]
      : [siteId, orgId]
    idxProducts = push(
      `SELECT DISTINCT p.id, pl.location_id
         FROM products p
         JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id AND pub.published = 1
         JOIN product_locations pl ON pl.product_id = p.id AND pl.organization_id = p.organization_id AND pl.published = 1 AND pl.active = 1
         JOIN business_locations bl ON bl.id = pl.location_id AND bl.site_id = pub.site_id AND bl.status = 'active'
        WHERE pub.site_id = ? ${locationSlug ? 'AND pl.location_id = ?' : ''} AND p.organization_id = ? AND p.active = 1
        ORDER BY pl.location_id, p.name, p.id`,
      productParams,
    )

    idxProductMedia = push(
      `SELECT ma.*, mp.owner_id AS product_id, mp.slot, mp.sort_order
         FROM media_placements mp
         JOIN media_assets ma ON ma.id = mp.asset_id
          AND ma.organization_id = mp.organization_id
          AND ma.site_id = mp.site_id
          AND ma.status = 'active'
        WHERE mp.organization_id = ? AND mp.site_id = ?
          AND mp.owner_type = 'product' AND mp.slot IN ('image', 'gallery') AND mp.status = 'active'
        ORDER BY mp.owner_id, mp.slot, mp.sort_order, mp.id`,
      [orgId, siteId],
    )
  }


  if (needsGlobalReviews)
    idxReviews = push(
      `SELECT r.id, r.author_name, r.rating, r.content, r.created_at, r.source,
              r.original_review_date, r.original_reference, r.google_review_metadata,
              r.location_id, bl.title AS location_title
       FROM reviews r
       LEFT JOIN business_locations bl ON bl.id = r.location_id
       WHERE r.site_id = ? AND r.status = 'approved'
       ORDER BY CASE WHEN r.source = 'google_places' THEN r.original_review_date ELSE r.created_at END DESC, r.id ASC LIMIT 50`,
      [siteId],
    );

  // Posts are fetched separately via getPublishedPosts() below, which returns the fully
  // formatted PublishedPostSummary shape (slug, canonical_url, gallery media) that this raw
  // row shape doesn't have — no point running an equivalent query here just to discard it.

  if (locationId && requestedDatasets.has("reviews"))
    idxLocReviews = push(
      `SELECT r.id, r.author_name, r.rating, r.content, r.created_at, r.source, r.original_review_date, r.original_reference, r.google_review_metadata
       FROM reviews r WHERE r.location_id = ? AND r.site_id = ? AND r.status = 'approved'
       ORDER BY CASE WHEN r.source = 'google_places' THEN r.original_review_date ELSE r.created_at END DESC, r.id ASC LIMIT 3`,
      [locationId, siteId],
    );

  if (locationId && requestedDatasets.has("reviews"))
    idxFullReviews = push(
      `SELECT r.id, r.author_name, r.rating, r.title, r.content, r.owner_reply, r.owner_reply_at,
              r.source, r.created_at, r.original_review_date, r.original_reference, r.google_review_metadata
       FROM reviews r WHERE r.location_id = ? AND r.site_id = ? AND r.status = 'approved'
       ORDER BY CASE WHEN r.source = 'google_places' THEN r.original_review_date ELSE r.created_at END DESC, r.id ASC LIMIT 50`,
      [locationId, siteId],
    );

  if (locationId && requestedDatasets.has("reviews"))
    idxReviewAggregate = push(
      `SELECT rating
       FROM reviews WHERE location_id = ? AND site_id = ? AND status = 'approved'`,
      [locationId, siteId],
    );

  if (requestedDatasets.has("photos"))
    idxPhotos = push(
      locationId
        ? `SELECT mp.id AS placement_id, mp.owner_type, mp.owner_id, mp.slot, mp.sort_order, ma.id, ma.public_url, ma.thumbnail_url, ma.kind, ma.alt_text, ma.category, ma.created_at
           FROM media_placements mp JOIN media_assets ma ON ma.id = mp.asset_id
           WHERE mp.site_id = ? AND mp.owner_type = 'business_location' AND mp.owner_id = ? AND mp.slot = 'gallery' AND mp.status = 'active' AND ma.kind = 'image' AND ma.status = 'active'
           ORDER BY mp.sort_order LIMIT 100`
        : `SELECT mp.id AS placement_id, mp.owner_type, mp.owner_id, mp.slot, mp.sort_order, ma.id, ma.public_url, ma.thumbnail_url, ma.kind, ma.alt_text, ma.category, ma.created_at
           FROM media_placements mp JOIN media_assets ma ON ma.id = mp.asset_id
           WHERE mp.site_id = ? AND mp.owner_type = 'business_location' AND mp.slot = 'gallery' AND mp.status = 'active' AND ma.kind = 'image' AND ma.status = 'active'
           ORDER BY mp.owner_id, mp.sort_order LIMIT 100`,
      locationId ? [siteId, locationId] : [siteId],
    );

  if (requestedDatasets.has("blog"))
    idxBlogList = push(
      `SELECT p.id, root.id AS root_id, root.slug AS source_slug, p.title, p.slug, p.summary AS excerpt, (p.metadata_json ->> '$.category') AS category, (p.metadata_json ->> '$.nav_title') AS nav_title, p.seo_description, p.seo_keywords,
              p.canonical_url, p.robots, root.published_at, p.updated_at,
              ${COVER_SELECT},
              CAST(MAX(1, ROUND((COALESCE((
                SELECT SUM(LENGTH(COALESCE(json_extract(cb.data_json, '$.markdown'), json_extract(cb.data_json, '$.text'), '')))
                FROM content_documents cd
                JOIN content_blocks cb ON cb.document_id = cd.id
                WHERE cd.id = p.id
              ), 0) / 5.0) / 200.0)) AS INTEGER) AS read_time_minutes
       FROM content_documents root JOIN content_documents p ON COALESCE(p.root_id,p.id) = root.id AND p.locale = ?
       ${coverJoinSql('p')}
       WHERE root.row_role = 'root' AND root.kind = 'article' AND root.status = 'published' AND p.site_id = ? AND root.visibility = 'public'
       ORDER BY root.published_at IS NULL, root.published_at DESC, p.id DESC
       LIMIT ?`,
      [localizedLocale ?? "en", siteId, page === "home" ? 3 : 50],
    );

  if (requestedDatasets.has("blogPost") && blogSlug)
    idxBlogPost = push(
      `SELECT p.id, root.id AS root_id, root.slug AS source_slug, p.title, p.slug, p.summary AS excerpt, (p.metadata_json ->> '$.category') AS category, (p.metadata_json ->> '$.nav_title') AS nav_title, p.seo_description, p.seo_keywords,
              p.canonical_url, p.robots, root.published_at, p.created_at, p.updated_at,
              ${COVER_SELECT}
       FROM content_documents root JOIN content_documents p ON COALESCE(p.root_id,p.id) = root.id AND p.locale = ?
       ${coverJoinSql('p')}
       WHERE ${localizedBlogPostId ? 'p.id' : 'p.slug'} = ? AND p.site_id = ? AND root.row_role = 'root' AND root.kind = 'article' AND root.status = 'published'
       LIMIT 1`,
      [localizedLocale ?? "en", localizedBlogPostId ?? blogSlug, siteId],
    );

  if (requestedDatasets.has("qa")) idxQa = push(
    `SELECT p.id, root.location_id, p.title AS question, p.summary AS answer,
      (root.metadata_json ->> '$.question_author') AS question_author, (root.metadata_json ->> '$.question_date') AS question_date,
      (root.metadata_json ->> '$.answer_author') AS answer_author, (root.metadata_json ->> '$.answer_date') AS answer_date,
      (root.metadata_json ->> '$.is_owner_answer') AS is_owner_answer, (root.metadata_json ->> '$.upvote_count') AS upvote_count,
      p.created_at, p.updated_at FROM content_documents root
      JOIN content_documents p ON COALESCE(p.root_id,p.id) = root.id AND p.locale = ?
      WHERE root.kind = 'qa' AND root.row_role = 'root' AND root.status = 'published' AND root.site_id = ?
        AND ${locationId ? 'root.location_id = ?' : 'root.scope_path IS NULL'}
      ORDER BY is_owner_answer DESC, upvote_count DESC, root.sort_order, p.created_at`,
    [localizedLocale ?? 'en', siteId, ...(locationId ? [locationId] : [])],
  );

  // Single D1 round trip
  options.signal?.throwIfAborted();
  const batchResults = batchStmts.length > 0
    ? await executeBatch(db, batchStmts)
    : [];
  options.signal?.throwIfAborted();

  const sourceShell = buildPublicShellPayload(site, batchResults, shellIndexes)
  const shell = (() => {
    if (!localizedLocale) return sourceShell
    const siteLocalization = publicLocalizations.find(item => item.resourceType === 'site' && item.resourceId === siteId)
    const localizedSite = siteLocalization
      ? projectExactLocalizedResource('site', site, siteLocalization)
      : { ...site, brand_name: null, brand_description: null, seo_title: null, seo_description: null }
    const locations = projectExactLocalizedCollection('business_location', sourceShell.locations, publicLocalizations)
    const {
      brand_name: _sourceBrandName,
      brand_description: _sourceBrandDescription,
      seo_title: _sourceSeoTitle,
      seo_description: _sourceSeoDescription,
      ...config
    } = sourceShell.config
    if (localizedSite.brand_name) {
      config.brand_name = localizedSite.brand_name
      config.seo_title = localizedSite.brand_name
    }
    if (localizedSite.brand_description) {
      config.brand_description = localizedSite.brand_description
      config.seo_description = localizedSite.brand_description
    }
    return {
      ...sourceShell,
      site: {
        ...sourceShell.site,
        brand_name: localizedSite.brand_name,
        brand_description: localizedSite.brand_description,
      },
      locations,
      config,
      googleBusiness: {
        ...sourceShell.googleBusiness,
        business: null,
      },
    }
  })()

  // Extract batch results by tracked index
  const locRows = idxLoc >= 0
    ? batchResults[idxLoc] as { results: Record<string, unknown>[] }
    : { results: [] as Record<string, unknown>[] };
  const reviewRows =
    idxReviews >= 0
      ? (batchResults[idxReviews] as { results: Record<string, unknown>[] })
      : { results: [] as Record<string, unknown>[] };
  const locationReviewRows =
    idxLocReviews >= 0
      ? (batchResults[idxLocReviews] as { results: Record<string, unknown>[] })
      : { results: [] as Record<string, unknown>[] };
  const fullReviewRows =
    idxFullReviews >= 0
      ? (batchResults[idxFullReviews] as { results: ReviewRow[] })
      : { results: [] as ReviewRow[] };
  const reviewAggregateRows =
    idxReviewAggregate >= 0
      ? (batchResults[idxReviewAggregate] as { results: Array<{ rating: number | string | null }> })
      : { results: [] as Array<{ rating: number | string | null }> };
  const photoRows =
    idxPhotos >= 0
      ? (batchResults[idxPhotos] as { results: Record<string, unknown>[] })
      : { results: [] as Record<string, unknown>[] };
  const qaRows =
    idxQa >= 0
      ? (batchResults[idxQa] as { results: Record<string, unknown>[] })
      : { results: [] as Record<string, unknown>[] };
  const sourceLocale = 'en';
  const routePagePath = canonicalTenantPagePath(page)
  const contentPagePath = requestedDatasets.has('content') ? routePagePath : null
  const tenantPage = contentPagePath
    ? await getPublicTenantPageForPath(db, siteId, contentPagePath, {
        locale,
        preview: isPreviewAuthorized,
        localizations: localizedLocale ? publicLocalizations : null,
      })
    : null
  // These complete built-in routes may display an optional CMS content overlay.
  // The route remains valid when that optional overlay has no translated page.
  const allowsMissingLocalizedTenantPage = page === 'contact'
    || page === 'reservations'
    || page === 'order'
  if (contentPagePath && !tenantPage && locale && locale !== sourceLocale && !isPreviewAuthorized && !allowsMissingLocalizedTenantPage) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Localized page was not found' })
  }
  const contentRows: SiteContent[] = tenantPage ? tenantPageToContentRows(tenantPage) : []

  let products: Product[] = []
  let collections: Collection[] = []
  if (includeProducts) {
    const locationCapabilityRows = (batchResults[shellIndexes.locations] as { results: Record<string, unknown>[] })?.results ?? []
    const enabledLocationIds = new Set(locationCapabilityRows.filter((location) => {
      const { capabilities } = resolveSiteCmsCapabilities(String(site.vertical), site.theme_id, {
        siteEnabledFeatures: site.feature_overrides,
        locationEnabledFeatures: location.feature_overrides as string | null,
      })
      return capabilities.managers.some(manager => manager.key === 'location.products')
    }).map(location => String(location.id)))
    const productIdRows = ((batchResults[idxProducts] as { results: Record<string, unknown>[] })?.results ?? [])
      .filter(row => enabledLocationIds.has(String(row.location_id)))
    const productIds = [...new Set(productIdRows.map(row => String(row.id)))]
    const productMediaRows = (batchResults[idxProductMedia] as { results: ProductMediaRow[] })?.results ?? []
    const mediaByProduct = new Map<string, ProductMediaRow[]>()
    for (const row of productMediaRows) {
      const rows = mediaByProduct.get(row.product_id) ?? []
      rows.push(row)
      mediaByProduct.set(row.product_id, rows)
    }
    // One canonical read, hydrated in a single batch. This page does not
    // reassemble variants, prices and collections from its own SQL — the
    // catalog has one reader and a projection that disagreed with it is
    // exactly the drift this replaces.
    const canonical = productIds.length
      ? await listSiteProducts(db, { organizationId: orgId, siteId, publishedOnly: true })
      : []
    const wanted = new Set(productIds)
    products = canonical.filter(product => wanted.has(product.id)).map((product) => {
      const media = mediaByProduct.get(product.id) ?? []
      const image = media.find(item => item.slot === 'image')
      return {
        ...product,
        image: image ? toResolvedMediaAsset(image) : null,
        gallery: media.filter(item => item.slot === 'gallery').map(toResolvedMediaAsset),
      }
    })
    // Collections are the site's merchandising order, which is what the
    // public grouping renders. A page with products and no collections shows
    // no groups rather than inventing one. A location page shows the site's
    // own collections and that location's — never another branch's, which a
    // Product offered at both would otherwise drag onto the page.
    collections = locationId
      ? [
          ...await listCollections(db, { organizationId: orgId, siteId, locationId: null }),
          ...await listCollections(db, { organizationId: orgId, siteId, locationId }),
        ]
      : await listCollections(db, { organizationId: orgId, siteId })
    if (localizedLocale) {
      collections = projectExactLocalizedCollection('collection', collections, publicLocalizations)
      products = projectExactLocalizedCollection('product', products, publicLocalizations).map(product => ({
        ...product,
        image: product.image ? projectLocalizedMediaAlt([product.image], publicLocalizations)[0] ?? null : null,
        gallery: projectLocalizedMediaAlt(product.gallery, publicLocalizations),
      }))
    }
  }

  options.signal?.throwIfAborted();
  const [globalPublishedPosts, locationPublishedPosts] = await Promise.all([
    needsGlobalPosts ? getPublishedPosts(db, siteId, page === "posts" ? 50 : 6, undefined, localizedLocale ?? "en") : Promise.resolve([]),
    locationId && requestedDatasets.has("posts")
      ? getPublishedPosts(db, siteId, 50, locationId, localizedLocale ?? "en")
      : Promise.resolve([]),
  ]);


  // Shape locations
  const locations = (locRows.results ?? []).map((loc) => {
    const publicUrl = loc.media_public_url as string | null;

    const address = loc.address as string | null
    const openingHours = loc.opening_hours as string | null
    const specialHours = loc.special_hours as string | null
    return {
      id: loc.id,
      slug: loc.slug,
      title: loc.title,
      address: address ? JSON.parse(address) : null,
      phone: loc.phone,
      email: (loc.email as string | null) ?? null,
      website_url: loc.website_url,
      maps_url: loc.maps_url,
      map_embed_url: calculateMapEmbedUrl({
        title: loc.title as string,
        maps_url: loc.maps_url as string | null,
        latitude: loc.latitude as number | null,
        longitude: loc.longitude as number | null,
        address: loc.address as string | null,
        city: loc.city as string | null,
      }),
      latitude: loc.latitude,
      longitude: loc.longitude,
      opening_hours: parseOpeningHours(openingHours ? JSON.parse(openingHours) : null),
      special_hours: parseSpecialHours(specialHours ? JSON.parse(specialHours) : null),
      timezone: loc.timezone,
      rating: loc.rating,
      review_count: loc.review_count,
      status: loc.status,
      media: publicUrl ? [{
        asset_id: loc.asset_id,
        slot: 'hero',
        public_url: publicUrl,
        thumbnail_url: loc.media_thumbnail_url,
        kind: loc.media_kind,
      }] : [],
      city: loc.city,
      neighborhood: loc.neighborhood || null,
      short_description: loc.short_description || null,
      description: loc.description || null,
      grab_url: loc.grab_url || null,
      uber_eats_url: loc.uber_eats_url || null,
      foodpanda_url: loc.foodpanda_url || null,
      seo_title: (loc.seo_title as string | null) ?? null,
      seo_description: (loc.seo_description as string | null) ?? null,
      canonical_url: (loc.canonical_url as string | null) ?? null,
      robots: (loc.robots as string | null) ?? null,
    };
  });

  const needsReservationPolicies = requestedDatasets.has('reservationPolicies');
  if (needsReservationPolicies && !locale && !sourceLocale) {
    throw new HTTPError({
      statusCode: 500,
      statusMessage: 'Site source locale is not configured',
    });
  }
  options.signal?.throwIfAborted();
  // Reservation policy is a location's own typed row. A product's booking
  // terms are its metafields and are read with the product, so there is no
  // second policy index to resolve here.
  const reservationPolicies = needsReservationPolicies
    ? new Map(await Promise.all(locations.map(async location => [
        String(location.id),
        await getLocationReservationConfig(db, { organizationId: orgId, locationId: String(location.id) }),
      ] as const)))
    : null
  options.signal?.throwIfAborted();
  const policyLocale = locale ?? sourceLocale!;
  // One localized field, from one place: the location's own translation. The
  // old resolver had to guess which of three scopes a rendered rule came from
  // before it could find the right translation for it.
  const localizeReservationNotes = (locationId: string, config: LocationReservationConfig): LocationReservationConfig => {
    if (!localizedLocale) return config
    const localized = publicLocalizations.find(item => item.resourceType === 'business_location' && item.resourceId === locationId)
    const values = localized?.values as { reservation?: { policy?: { additional_notes_html?: string } } } | undefined
    return { ...config, additional_notes_html: values?.reservation?.policy?.additional_notes_html ?? null }
  }
  const reservationPolicyByLocation = Object.fromEntries(
    Array.from(reservationPolicies ?? [], ([locationId, config]) => [
      locationId,
      config ? renderBookingPolicySummary(reservationPolicySummarySource(localizeReservationNotes(locationId, config)), policyLocale) : null,
    ]),
  );

  // Shape full reviews (type A)
  const locationForAggregate = locationId
    ? ((locRows.results ?? []).find((l) => l.id === locationId) ?? null)
    : null;
  const fullReviewList = fullReviewRows?.results ?? []
  const reviewMedia = await getMediaPlacements(db, { siteId, ownerType: 'review', ownerIds: fullReviewList.map(review => String(review.id)) })
  const fullReviews = fullReviewList.map(r => ({ ...r, google_review_metadata: parseGoogleReviewMetadata(r.google_review_metadata), media: reviewMedia.get(String(r.id)) ?? [] }));
  const aggregateLocation = locationForAggregate ? {
    rating: typeof locationForAggregate.rating === 'number' ? locationForAggregate.rating : null,
    review_count: typeof locationForAggregate.review_count === 'number' ? locationForAggregate.review_count : null,
    last_synced_at: typeof locationForAggregate.last_synced_at === 'string' ? locationForAggregate.last_synced_at : null,
  } : {
    rating: null,
    review_count: null,
    last_synced_at: null,
  };
  const reviewsAggregate = buildPublicReviewAggregate(
    normalizePublicReviewAggregateRows(reviewAggregateRows.results),
    aggregateLocation,
  );

  // Shape photos (type E)
  const sourceMedia = (photoRows?.results ?? []).map((asset) => {
    if (typeof asset.id !== 'string' || (asset.alt_text !== null && typeof asset.alt_text !== 'string')) {
      throw new HTTPError({ statusCode: 500, statusMessage: 'Stored public media is invalid' })
    }
    return {
      placement_id: asset.placement_id,
      owner_type: asset.owner_type,
      owner_id: asset.owner_id,
      slot: asset.slot,
      asset_id: asset.id,
      public_url: asset.public_url,
      thumbnail_url: asset.thumbnail_url,
      kind: asset.kind,
      alt_text: asset.alt_text,
      category: PUBLIC_PHOTO_CATEGORY[String(asset.category || "other")] ?? "OTHER",
      sort_order: asset.sort_order,
    }
  });
  const media = localizedLocale
    ? projectLocalizedMediaAlt(sourceMedia, publicLocalizations)
    : sourceMedia

  // Shape blog list
  const sourceBlogList =
    idxBlogList >= 0
      ? (
          (batchResults[idxBlogList] as { results: ApiRecord[] })?.results ?? []
        ).map(attachCover)
      : [];
  const blogList = sourceBlogList

  let blogPost: ApiRecord | null = null;
  let sourceBlogPostIdentity: { id: string; slug: string } | null = null
  if (idxBlogPost >= 0) {
    const postRow = (batchResults[idxBlogPost] as { results: ApiRecord[] })
      ?.results?.[0];
    if (postRow) {
      if (typeof postRow.id !== 'string' || typeof postRow.slug !== 'string') {
        throw new HTTPError({ statusCode: 500, statusMessage: 'Stored public blog post is invalid' })
      }
      sourceBlogPostIdentity = { id: String(postRow.root_id), slug: String(postRow.source_slug) }
      options.signal?.throwIfAborted();
      const loadedBlocks = await getContentBlocksForDocument(db, postRow.id);
      const contentBlocks = loadedBlocks
        ? await attachPageQa(db, siteId, tenantBlogPostPath({ themeId: site.theme_id, vertical: site.vertical }, String(postRow.source_slug)), loadedBlocks, localizedLocale ?? 'en')
        : loadedBlocks
      blogPost = attachCover({ ...postRow, content_blocks: contentBlocks });
    }
  }

  const sourceQaList = (requestedDatasets.has("qa") ? qaRows?.results ?? [] : []).map((row) => {
    if (typeof row.id !== 'string') throw new HTTPError({ statusCode: 500, statusMessage: 'Stored public Q&A is invalid' })
    return { ...row, id: row.id }
  })
  const qaList = sourceQaList

  const sourceLocationRow = locationId
    ? (locRows.results ?? []).find(row => row.id === locationId)
    : null
  const sourceLocationSlug = typeof sourceLocationRow?.slug === 'string' ? sourceLocationRow.slug : null
  let representationSourcePath = routePagePath ?? '/'
  let representationDocumentId: string | undefined
  let representationResource: { type: LocalizedResourceType; id: string; routeSuffix?: string } | undefined
  if (sourceBlogPostIdentity) {
    const prefix = normalizedVertical === 'service' ? 'article' : 'blog'
    representationSourcePath = `/${prefix}/${sourceBlogPostIdentity.slug}`
    representationDocumentId = sourceBlogPostIdentity.id
  } else if (locationId && sourceLocationSlug) {
    const routeSuffix = page && page !== 'location' ? `/${page}` : ''
    representationSourcePath = `/locations/${sourceLocationSlug}${routeSuffix}`
    representationResource = { type: 'business_location', id: locationId, routeSuffix }
  }
  const localeRepresentations = !representationResource && tenantPage?.localeRepresentations
    ? tenantPage.localeRepresentations
    : await listPublicLocaleRepresentations(db, {
        organizationId: orgId,
        siteId,
        sourcePath: representationSourcePath,
        resource: representationResource,
        documentId: representationDocumentId,
        publishedLocaleRoute: !representationResource && !representationDocumentId && Boolean(routePagePath),
      })
  const pagePayload = {
    kind: page ?? 'home',
    success: true,
    shell,
    content: contentRows,
    content_blocks: groupContentBlocks(contentRows),
    tenant_page: tenantPage,
    products,
    collections,
    locationReviews: (locationReviewRows?.results ?? []).map(review => ({ ...review, google_review_metadata: parseGoogleReviewMetadata(review.google_review_metadata) })),
    globalReviews: needsGlobalReviews ? (reviewRows.results ?? []).map(review => ({ ...review, google_review_metadata: parseGoogleReviewMetadata(review.google_review_metadata) })) : [],
    reviewsAggregate: requestedDatasets.has("reviews") ? reviewsAggregate : null,
    reviewsList: requestedDatasets.has("reviews") ? fullReviews : [],
    media: requestedDatasets.has("photos") ? media : [],
    qaList,
    blogList: requestedDatasets.has("blog") ? blogList : [],
    blogPost: requestedDatasets.has("blogPost") ? blogPost : null,
    postsList: requestedDatasets.has("posts") ? locationPublishedPosts : [],
    globalPosts: needsGlobalPosts ? globalPublishedPosts : [],
    reservationPolicyByLocation,
    localeRepresentations,
  };
  const payload = pagePayload;

  // Slug-shaped inputs are only worth caching once they've resolved to a real
  // row — otherwise a stream of made-up slugs (still regex-valid) would each
  // mint their own permanent KV entry. locationRow/blogPost are the actual
  // D1-resolved lookups for locationSlug/blogSlug.
  const resolvedSlugsValid =
    (!locationSlug || !!locationRow) &&
    (!blogSlug || !!blogPost);

  if (usePageCache && resolvedSlugsValid) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kv = (env as any).SITE_CACHE as KVNamespace | undefined;
    if (kv) {
      const putAsync = putPublicResourceCache(kv, cacheKey, JSON.stringify(payload)).catch(
        (err: unknown) => {
          console.warn("[public-resource-cache] page put failed:", String(err));
        },
      );
      const waitUntil = getCloudflareWaitUntil(event);
      if (waitUntil) waitUntil(putAsync);
    }
  }

  return payload;
}

export const loadPublicPage = (
  event: H3Event,
  siteId: string,
  query: Record<string, string | undefined>,
  options?: PublicPageLoadOptions,
) => {
  if (options?.signal) {
    const startedAt = performance.now();
    return loadPublicPageSource(event, siteId, query, options)
      .finally(() => recordRequestPhase(event, "page", startedAt));
  }
  let requestReads = publicPageReadsByRequest.get(event);
  if (!requestReads) {
    requestReads = new Map();
    publicPageReadsByRequest.set(event, requestReads);
  }
  const queryKey = JSON.stringify(
    Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const key = `${siteId}:${queryKey}`;
  const existing = requestReads.get(key);
  if (existing) return existing;

  const startedAt = performance.now();
  const operation = loadPublicPageSource(event, siteId, query, options);
  const pending = operation
    .finally(() => recordRequestPhase(event, "page", startedAt))
    .catch((error) => {
      if (requestReads.get(key) === pending) requestReads.delete(key);
      throw error;
    });
  requestReads.set(key, pending);
  return pending;
};
