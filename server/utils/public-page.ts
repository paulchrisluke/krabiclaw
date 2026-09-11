import { parseOpeningHours, parseSpecialHours, parseRecurringSlots } from '~/shared/reservation-hours'
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
import { mapProduct } from '~/server/utils/product-management'
import { previewSecretOf, resolvePreviewAuthorization } from "~/server/utils/preview-token";
import { attachAvailabilitySummaries, attachExperienceMedia, type Experience } from "~/server/utils/experiences";
import {
  toResolvedMediaAsset,
  type MediaAsset,
} from "~/server/utils/media-asset-manager";
import { getMediaPlacements } from '~/server/utils/media-placement'
import type { Product } from '~/server/types/products'
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
import {
  renderBookingPolicySummary,
  resolveBookingPolicyIndex,
} from "~/server/utils/booking-policies";
import { getCloudflareWaitUntil } from "~/server/utils/mcp-route-helpers";
import { isNonProductionHost } from "~/server/utils/tenant-hosts";
import { getPublishedPosts } from "~/server/utils/post-management";
import { loadPublicBase } from "~/server/utils/public-base";
import { appendPublicShellQueries, buildPublicShellPayload } from "~/server/utils/public-shell-query";
import { isPublicPagePayload } from '~/utils/public-resource-contracts'
import type { LocalizedResourceType } from '~/server/utils/localization-registry'
import { validateProductDetails, validateProductTags } from '~/server/utils/product-validation'
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



function projectLocalizedExperience(source: Experience, localization: Parameters<typeof projectExactLocalizedResource>[2]): Experience {
  const product = projectExactLocalizedResource('product', { ...source, name: source.title, description: source.body }, localization)
  const extra = localization.values.experience as Record<string, unknown> | undefined
  return { ...product, title: typeof product.name === 'string' ? product.name : '', body: product.description ?? null,
    tagline: typeof extra?.tagline === 'string' ? extra.tagline : null,
    pricing_note: typeof extra?.pricing_note === 'string' ? extra.pricing_note : null,
    included_items: Array.isArray(extra?.included_items) ? extra.included_items as string[] : [],
    what_to_bring: Array.isArray(extra?.what_to_bring) ? extra.what_to_bring as string[] : [],
    meeting_point: typeof extra?.meeting_point === 'string' ? extra.meeting_point : null,
    cancellation_policy: typeof extra?.cancellation_policy === 'string' ? extra.cancellation_policy : null,
  }
}

function parseExperienceRow(row: Record<string, unknown>): Experience {
  const parseStringArr = (value: unknown): string[] => {
    if (typeof value === "string" && value) {
      const parsed = JSON.parse(value)
      if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === "string")) {
        throw new HTTPError({ statusCode: 500, statusMessage: 'Stored experience string array is invalid', data: { code: 'INVALID_STORED_CONTENT' } })
      }
      return parsed.filter(item => item.trim().length > 0)
    }
    if (Array.isArray(value)) {
      if (!value.every((item): item is string => typeof item === "string")) {
        throw new HTTPError({ statusCode: 500, statusMessage: 'Stored experience string array is invalid', data: { code: 'INVALID_STORED_CONTENT' } })
      }
      return value
    }
    if (value == null || value === '') return []
    throw new HTTPError({ statusCode: 500, statusMessage: 'Stored experience string array is invalid', data: { code: 'INVALID_STORED_CONTENT' } })
  };

  const recurring_slots = parseRecurringSlots(row.recurring_slots ? JSON.parse(String(row.recurring_slots)) : null)

  const {
    price_id, amount_minor, currency, price_unit, tax_behavior, compare_at_amount_minor,
    valid_from, valid_until, provenance, price_created_by, price_created_at,
    ...experienceRow
  } = row

  return {
    ...(experienceRow as unknown as Experience),
    price: price_id == null ? null : {
      id: String(price_id), organization_id: String(row.organization_id), site_id: String(row.site_id),
      location_id: row.location_id == null ? null : String(row.location_id), product_id: String(row.id), amount_minor: Number(amount_minor),
      currency: String(currency), unit: String(price_unit), tax_behavior: String(tax_behavior),
      compare_at_amount_minor: compare_at_amount_minor == null ? null : Number(compare_at_amount_minor),
      valid_from: String(valid_from), valid_until: valid_until == null ? null : String(valid_until),
      provenance: String(provenance), created_by: String(price_created_by), created_at: String(price_created_at),
    } as Experience['price'],
    status: row.status as Experience["status"],
    tags: validateProductTags(JSON.parse(String(row.tags_json))),
    details: validateProductDetails(JSON.parse(String(row.details_json))),
    included_items: parseStringArr(row.included_items),
    what_to_bring: parseStringArr(row.what_to_bring),
    meeting_point: row.meeting_point ?? null,
    recurring_slots,
    featured: Boolean(row.featured),
  } as Experience
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
  const experienceSlug =
    typeof query.experience === "string" ? query.experience : null;
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
    'blog', 'blogPost', 'experiences', 'experienceDetail',
    'reservationPolicies', 'experiencePolicies',
  ]);
  // Mirrors composables/usePublicPageRequest.ts's getPublicPageRequest() — the only
  // page values the frontend ever requests. A regex alone (e.g. /^[a-z0-9_-]+$/)
  // would still let an attacker mint unlimited distinct cache keys by varying
  // the page value; allowlisting against the real route set bounds that space.
  const VALID_PAGES = new Set([
    'home', 'locations', 'location', 'about', 'contact', 'reservations',
    'order', 'qa', 'reviews', 'posts', 'experiences', 'photos', 'menu', 'products', 'blog',
  ]);
  const areDatasetsValid = [...requestedDatasets].every(dataset => VALID_DATASETS.has(dataset));
  const isValidLocale = locale === undefined || /^[a-z]{2}(-[A-Z]{2})?$/.test(locale);
  const isValidPage = page === null || VALID_PAGES.has(page);
  // locationSlug/experienceSlug/blogSlug can't be allowlisted up front — they're
  // arbitrary per-tenant slugs resolved against D1. The regex here only bounds
  // the character set for a cheap pre-DB shape check; the actual cache *write*
  // below is additionally gated on the slug having resolved to a real row, so
  // slugs that don't correspond to an existing entity never populate the cache.
  const isValidLocation = locationSlug === null || /^[a-z0-9_-]+$/.test(locationSlug);
  const isValidExperience = experienceSlug === null || /^[a-z0-9_-]+$/.test(experienceSlug);
  const isValidBlogSlug = blogSlug === null || /^[a-z0-9_-]+$/.test(blogSlug);

  const allInputsValid = areDatasetsValid && isValidLocale && isValidPage &&
    isValidLocation && isValidExperience && isValidBlogSlug;
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
    experience: experienceSlug,
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

  const localizedExperienceId = localizedLocale && experienceSlug
    ? resolveLocalizedRouteResourceId(publicLocalizations, 'product', `/${localizedLocale}/experiences/${experienceSlug}`)
    : null
  if (localizedLocale && experienceSlug && !localizedExperienceId) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Localized Experience was not found' })
  }
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
    requestedDatasets.has("experiences") ||
    requestedDatasets.has("reservationPolicies") ||
    requestedDatasets.has("experiencePolicies");

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

  let idxExperiencesList = -1,
    idxExperienceDetail = -1;
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
    const locationClause = locationSlug ? 'AND location_id = ?' : ''
    const productParams = locationSlug
      ? [orgId, siteId, locationId ?? '__missing-location__']
      : [orgId, siteId]
    idxProducts = push(
      `SELECT p.id, p.organization_id, p.site_id, p.location_id, p.product_type, p.category_id, p.name, p.slug, p.description,
              pc.name AS category_name, pc.slug AS category_slug, pc.sort_order AS category_sort_order,
              p.order_url, p.is_visible, p.available, p.featured, p.featured_sort_order, p.sort_order, p.tags_json,
              p.details_json, p.seo_title, p.seo_description, p.canonical_url, p.robots, p.source,
              p.created_at, p.updated_at, p.created_by, p.updated_by,
              pr.id AS price_id, pr.amount_minor, pr.currency, pr.unit AS price_unit, pr.tax_behavior,
              pr.compare_at_amount_minor, pr.valid_from, pr.valid_until, pr.provenance,
              pr.created_by AS price_created_by, pr.created_at AS price_created_at
         FROM products p
         JOIN product_categories pc ON pc.id = p.category_id
         LEFT JOIN prices pr ON pr.product_id = p.id AND pr.valid_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           AND (pr.valid_until IS NULL OR pr.valid_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        WHERE p.organization_id = ? AND p.site_id = ? AND p.product_type = 'standard' AND p.is_visible = 1 ${locationClause.replace('location_id', 'p.location_id')}
        ORDER BY p.location_id, pc.sort_order, p.sort_order, p.id`,
      productParams,
    )

    idxProductMedia = push(
      `SELECT ma.*, mp.owner_id AS product_id, mp.slot, mp.sort_order
         FROM media_placements mp
         JOIN products p ON p.id = mp.owner_id
         JOIN media_assets ma ON ma.id = mp.asset_id
          AND ma.organization_id = mp.organization_id
          AND ma.site_id = mp.site_id
          AND ma.status = 'active'
        WHERE p.product_type = 'standard' AND p.organization_id = ? AND p.site_id = ? AND p.is_visible = 1
          ${locationSlug ? 'AND p.location_id = ?' : ''}
          AND mp.owner_type = 'product' AND mp.slot IN ('image', 'gallery') AND mp.status = 'active'
        ORDER BY mp.owner_id, mp.slot, mp.sort_order, mp.id`,
      productParams,
    )
  }

  // Experiences remain route data. The page response also carries the shared
  // shell so the layout and route components consume one canonical resource.
  const needsExperiencesList =
    requestedDatasets.has("experiences") && !experienceSlug;

  if (needsExperiencesList) {
    const expParams: unknown[] = [orgId, siteId];
    let expSql = `SELECT p.id, p.organization_id, p.site_id, p.location_id,
                         p.name AS title, p.slug, json_extract(p.experience_json, '$.tagline') AS tagline, p.description AS body, json_extract(p.experience_json, '$.pricing_note') AS pricing_note,
                         pr.id AS price_id, pr.amount_minor, pr.currency, pr.unit AS price_unit, pr.tax_behavior,
                         pr.compare_at_amount_minor, pr.valid_from, pr.valid_until, pr.provenance,
                         pr.created_by AS price_created_by, pr.created_at AS price_created_at,
                         json_extract(p.experience_json, '$.duration_minutes') AS duration_minutes, json_extract(p.experience_json, '$.max_capacity') AS max_capacity, json_extract(p.experience_json, '$.recurring_slots') AS recurring_slots,
                         p.tags_json, p.details_json, json_extract(p.experience_json, '$.included_items') AS included_items, json_extract(p.experience_json, '$.what_to_bring') AS what_to_bring, json_extract(p.experience_json, '$.meeting_point') AS meeting_point,
              json_extract(p.experience_json, '$.cancellation_policy') AS cancellation_policy,
                         CASE WHEN p.available = 0 THEN 'sold_out' ELSE 'active' END AS status,
                         p.sort_order, p.featured, p.featured_sort_order,
                         p.seo_title, p.seo_description, p.canonical_url, p.robots, p.created_at, p.updated_at
                  FROM products p
                  LEFT JOIN prices pr ON pr.product_id = p.id AND pr.valid_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND (pr.valid_until IS NULL OR pr.valid_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                  WHERE p.product_type = 'experience' AND p.organization_id = ? AND p.site_id = ? AND p.is_visible = 1`;
    if (locationId) {
      expSql += ` AND p.location_id = ?`;
      expParams.push(locationId);
    }
    expSql += ` ORDER BY p.sort_order ASC, p.created_at ASC`;
    idxExperiencesList = push(expSql, expParams);
  }

  if (requestedDatasets.has("experienceDetail") && experienceSlug) {
    const experienceWhere = localizedExperienceId ? 'p.id = ?' : 'p.slug = ?'
    idxExperienceDetail = push(
      `SELECT p.id, p.organization_id, p.site_id, p.location_id,
              p.name AS title, p.slug, json_extract(p.experience_json, '$.tagline') AS tagline, p.description AS body, json_extract(p.experience_json, '$.pricing_note') AS pricing_note,
              pr.id AS price_id, pr.amount_minor, pr.currency, pr.unit AS price_unit, pr.tax_behavior,
              pr.compare_at_amount_minor, pr.valid_from, pr.valid_until, pr.provenance,
              pr.created_by AS price_created_by, pr.created_at AS price_created_at,
              json_extract(p.experience_json, '$.duration_minutes') AS duration_minutes, json_extract(p.experience_json, '$.max_capacity') AS max_capacity, json_extract(p.experience_json, '$.recurring_slots') AS recurring_slots,
              p.tags_json, p.details_json, json_extract(p.experience_json, '$.included_items') AS included_items, json_extract(p.experience_json, '$.what_to_bring') AS what_to_bring, json_extract(p.experience_json, '$.meeting_point') AS meeting_point,
              json_extract(p.experience_json, '$.cancellation_policy') AS cancellation_policy,
              CASE WHEN p.is_visible = 0 THEN 'inactive' WHEN p.available = 0 THEN 'sold_out' ELSE 'active' END AS status,
              p.sort_order, p.featured, p.featured_sort_order,
              p.seo_title, p.seo_description, p.canonical_url, p.robots, p.created_at, p.updated_at
       FROM products p
       LEFT JOIN prices pr ON pr.product_id = p.id AND pr.valid_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND (pr.valid_until IS NULL OR pr.valid_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       WHERE p.organization_id = ? AND p.site_id = ? AND p.product_type = 'experience' AND ${experienceWhere}
       LIMIT 1`,
      [orgId, siteId, localizedExperienceId ?? experienceSlug],
    );
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
    || page === 'experiences'
    || page === 'order'
  if (contentPagePath && !tenantPage && locale && locale !== sourceLocale && !isPreviewAuthorized && !allowsMissingLocalizedTenantPage) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Localized page was not found' })
  }
  const contentRows: SiteContent[] = tenantPage ? tenantPageToContentRows(tenantPage) : []

  let products: Product[] = []
  if (includeProducts) {
    const locationCapabilityRows = (batchResults[shellIndexes.locations] as { results: Record<string, unknown>[] })?.results ?? []
    const enabledLocationIds = new Set(locationCapabilityRows.filter((location) => {
      const { capabilities } = resolveSiteCmsCapabilities(String(site.vertical), site.theme_id, {
        siteEnabledFeatures: site.feature_overrides,
        locationEnabledFeatures: location.feature_overrides as string | null,
      })
      return capabilities.managers.some(manager => manager.key === 'location.products')
    }).map(location => String(location.id)))
    const productRows = ((batchResults[idxProducts] as { results: Record<string, unknown>[] })?.results ?? [])
      .filter(row => enabledLocationIds.has(String(row.location_id)))
    const productMediaRows = (batchResults[idxProductMedia] as { results: ProductMediaRow[] })?.results ?? []
    const mediaByProduct = new Map<string, ProductMediaRow[]>()
    for (const row of productMediaRows) {
      const rows = mediaByProduct.get(row.product_id) ?? []
      rows.push(row)
      mediaByProduct.set(row.product_id, rows)
    }
    products = productRows.map((row) => {
      const product = mapProduct(row)
      const media = mediaByProduct.get(product.id) ?? []
      return {
        ...product,
        image: media.find(item => item.slot === 'image') ? toResolvedMediaAsset(media.find(item => item.slot === 'image')!) : null,
        gallery: media.filter(item => item.slot === 'gallery').map(toResolvedMediaAsset),
      }
    })
    if (localizedLocale) {
      const categoryLocalizations = new Map(
        publicLocalizations
          .filter(item => item.resourceType === 'product_category')
          .map(item => [item.resourceId, item]),
      )
      products = projectExactLocalizedCollection('product', products, publicLocalizations)
        .flatMap(product => {
          const categoryLocalization = categoryLocalizations.get(product.category.id)
          if (!categoryLocalization) return []
          return [{
            ...product,
            category: projectExactLocalizedResource('product_category', product.category, categoryLocalization),
            image: product.image
              ? projectLocalizedMediaAlt([product.image], publicLocalizations)[0] ?? null
              : null,
            gallery: projectLocalizedMediaAlt(product.gallery, publicLocalizations),
          }]
        })
    }
  }

  // Build experiences
  const sourceExperiencesList: Experience[] =
    idxExperiencesList >= 0
      ? (
          (batchResults[idxExperiencesList] as { results: Record<string, unknown>[] })?.results ?? []
        ).map(parseExperienceRow)
      : [];
  const experiencesListRaw = localizedLocale
    ? sourceExperiencesList.flatMap(experience => {
        const localization = publicLocalizations.find(item => item.resourceType === 'product' && item.resourceId === experience.id)
        return localization ? [projectLocalizedExperience(experience, localization)] : []
      })
    : sourceExperiencesList
  options.signal?.throwIfAborted();
  const experiencesWithMedia = await attachExperienceMedia(db, siteId, experiencesListRaw);
  options.signal?.throwIfAborted();
  const experiencesList = requestedDatasets.has("experiences")
    ? await attachAvailabilitySummaries(db, siteId, experiencesWithMedia)
    : experiencesWithMedia;

  const sourceExperienceDetail: Experience | null =
    idxExperienceDetail >= 0
      ? (
          (batchResults[idxExperienceDetail] as { results: Record<string, unknown>[] })?.results[0] ?? null
        )
        ? parseExperienceRow(
            (batchResults[idxExperienceDetail] as { results: Record<string, unknown>[] }).results[0]!,
          )
        : null
      : null;
  const experienceDetailRaw = sourceExperienceDetail && localizedLocale
    ? (() => {
        const localization = publicLocalizations.find(item =>
          item.resourceType === 'product' && item.resourceId === sourceExperienceDetail.id,
        )
        return localization
          ? projectLocalizedExperience(sourceExperienceDetail, localization)
          : null
      })()
    : sourceExperienceDetail
  // inactive experiences are never public, at any route — sold_out stays visible
  // with its own messaging (see server/utils/experiences.ts listExperiences).
  options.signal?.throwIfAborted();
  const experienceDetail =
    experienceDetailRaw && experienceDetailRaw.status !== "inactive"
      ? (await attachAvailabilitySummaries(
          db,
          siteId,
          await attachExperienceMedia(db, siteId, [experienceDetailRaw]),
        ))[0]
      : null;

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

  const experiencePolicyTargets = new Map<string, { locationId: string | null }>();
  for (const experience of experiencesList) {
    experiencePolicyTargets.set(experience.id, {
      locationId: typeof experience.location_id === "string" ? experience.location_id : null,
    });
  }
  if (experienceDetail?.id) {
    experiencePolicyTargets.set(experienceDetail.id, {
      locationId: typeof experienceDetail.location_id === "string" ? experienceDetail.location_id : null,
    });
  }

  const needsReservationPolicies = requestedDatasets.has('reservationPolicies');
  const needsExperiencePolicies = requestedDatasets.has('experiencePolicies');
  if ((needsReservationPolicies || needsExperiencePolicies) && !locale && !sourceLocale) {
    throw new HTTPError({
      statusCode: 500,
      statusMessage: 'Site source locale is not configured',
    });
  }
  options.signal?.throwIfAborted();
  const [reservationPolicies, experiencePolicies] = await Promise.all([
    needsReservationPolicies ? resolveBookingPolicyIndex(db, {
      siteId,
      policyType: "reservation",
      locations: locations.map(location => String(location.id)),
    }) : Promise.resolve(null),
    needsExperiencePolicies ? resolveBookingPolicyIndex(db, {
      siteId,
      policyType: "experience",
      locations: locations.map(location => String(location.id)),
      experiences: experiencePolicyTargets,
    }) : Promise.resolve(null),
  ]);
  options.signal?.throwIfAborted();
  const policyLocale = locale ?? sourceLocale!;
  const localizePolicy = <T extends { id: string | null; policy_type: 'reservation' | 'experience'; scope_type: string; additional_notes_html: string | null }>(policy: T): T => {
    if (!localizedLocale || !policy.id) return policy
    const resourceType = policy.scope_type === 'site' ? 'site' : policy.scope_type === 'location' ? 'business_location' : 'product'
    const localized = publicLocalizations.find(item => item.resourceType === resourceType && item.resourceId === policy.id)
    const values = localized?.values as { booking?: { experience?: { additional_notes_html?: string; policy?: { additional_notes_html?: string } }; reservation?: { policy?: { additional_notes_html?: string } } }; experience?: { policy?: { additional_notes_html?: string } } } | undefined
    const notes = resourceType === 'site' ? values?.booking?.experience?.additional_notes_html
      : resourceType === 'product' ? values?.experience?.policy?.additional_notes_html : values?.booking?.[policy.policy_type]?.policy?.additional_notes_html
    return { ...policy, additional_notes_html: notes ?? null }
  }
  const reservationPolicyByLocation = Object.fromEntries(
    Array.from(reservationPolicies?.byLocation ?? [], ([locationId, policy]) => [
      locationId,
      policy.id ? renderBookingPolicySummary(localizePolicy(policy), policyLocale) : null,
    ]),
  );
  const experiencePolicySiteDefault = experiencePolicies?.site
    ? renderBookingPolicySummary(localizePolicy(experiencePolicies.site), policyLocale)
    : null;
  const experiencePolicyById = Object.fromEntries(
    Array.from(experiencePolicies?.byExperience ?? [], ([experienceId, policy]) => [
      experienceId,
      renderBookingPolicySummary(localizePolicy(policy), policyLocale),
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
  if (sourceExperienceDetail) {
    representationSourcePath = `/experiences/${sourceExperienceDetail.slug}`
    representationResource = { type: 'product', id: sourceExperienceDetail.id }
  } else if (sourceBlogPostIdentity) {
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
    experiencePolicySiteDefault,
    experiencePolicyById,
    experiencesList,
    experienceDetail,
    localeRepresentations,
  };
  const payload = pagePayload;

  // Slug-shaped inputs are only worth caching once they've resolved to a real
  // row — otherwise a stream of made-up slugs (still regex-valid) would each
  // mint their own permanent KV entry. locationRow/experienceDetail/blogPost
  // are the actual D1-resolved lookups for locationSlug/experienceSlug/blogSlug.
  const resolvedSlugsValid =
    (!locationSlug || !!locationRow) &&
    (!experienceSlug || !!experienceDetail) &&
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
