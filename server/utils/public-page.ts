// Canonical route-capability-driven public page service.
//   ?page=home|about|contact|location|reviews|photos|qa|...
//   ?location=slug          scope content to a location
//   ?datasets=content,menu   include only the named route capabilities
// All inline D1 queries run in a single executeBatch() call.
import { executeBatch, queryFirst, type BatchQuery } from "~/server/db";
import { getHeader, setHeader, type H3Event } from "h3";
import { cloudflareEnv } from "~/server/utils/api-response";
import { calculateMapEmbedUrl } from "~/server/utils/google-business";
import {
  buildPublicReviewAggregate,
  normalizePublicReviewAggregateRows,
} from "~/server/utils/public-review-aggregate";
import { getPublicTenantPageForPath, type PublicTenantPage } from "~/server/utils/public-tenant-pages";
import {
  mapMenu,
  mapMenuItem,
  sortMenuItems,
  normalizeSectionOrder,
  parseStringArray,
} from "~/server/utils/menu-management";
import { verifyPreviewToken } from "~/server/utils/preview-token";
import { attachAvailabilitySummaries, type Experience } from "~/server/utils/experiences";
import {
  hydrateMediaAssetsForExperiences,
  toResolvedMediaAsset,
  type MediaAsset,
  type ResolvedMediaAsset,
} from "~/server/utils/media-asset-manager";
import type { MenuWithItems } from "~/server/types/menu";
import {
  attachFeaturedImageFromBareJoin,
  listContentComponents,
  resolveContentComponentsMedia,
} from "~/server/utils/platform-content";
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
import { isPreviewContext } from "~/server/utils/tenant-hosts";
import { getPublishedPosts } from "~/server/utils/post-management";
import { loadPublicBase } from "~/server/utils/public-base";
import { appendPublicShellQueries, buildPublicShellPayload } from "~/server/utils/public-shell-query";
import { isPublicPagePayload } from '~/utils/public-resource-contracts'

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
  hero_media_asset_id?: string | null
  hero_public_url?: string | null
  hero_kind?: string | null
  thumbnail_url?: string | null
  component?: string | null
  updated_at: string
}

function groupContentBlocks(rows: SiteContent[]): Array<SiteContent & { _section: string }> {
  const groups = Object.create(null) as Record<string, SiteContent & { _section: string }>
  for (const row of rows) {
    const section = row.field?.split('.')[0] || 'unknown'
    if (!groups[section]) {
      groups[section] = { ...row, field: section, _section: section }
    } else {
      if (row.component) groups[section].component = row.component
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
  reviewer_photo_url: string | null;
  rating: number;
  title: string | null;
  content: string | null;
  owner_reply: string | null;
  owner_reply_at: string | null;
  photo_urls: string | null;
  source: string | null;
  created_at: string | null;
}

interface MenuTranslationRow {
  menu_id: string;
  name: string | null;
  description: string | null;
  section_order: string | null;
}

interface MenuItemTranslationRow {
  menu_item_id: string;
  section: string | null;
  name: string | null;
  description: string | null;
  allergens: string | null;
  ingredients: string | null;
  dietary_notes: string | null;
  preparation: string | null;
  serving_note: string | null;
}

type MenuItemMediaRow = MediaAsset & { menu_item_id: string; sort_order: number };

const publicPageReadsByRequest = new WeakMap<H3Event, Map<string, Promise<unknown>>>()

interface PublicPageLoadOptions {
  mutateResponseHeaders?: boolean
  signal?: AbortSignal
}

const parseJson = (raw: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

function canonicalTenantPagePath(page: string | null, locationSlug: string | null): string | null {
  if (!page) return null
  if (page === 'home') return '/'
  if (page === 'location') return locationSlug ? `/locations/${locationSlug}` : null
  if (page === 'locations') return '/locations'
  if (['about', 'contact', 'reservations', 'order', 'qa', 'reviews', 'posts', 'experiences', 'photos', 'menu', 'blog'].includes(page)) return `/${page}`
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
      component: null,
    } satisfies SiteContent
    if (block.type === 'hero') {
      rows.push({
        ...base,
        field: 'hero',
        content: typeof data.eyebrow === 'string' ? data.eyebrow : undefined,
        hero_title: typeof data.title === 'string' ? data.title : null,
        hero_subtitle: typeof data.subtitle === 'string' ? data.subtitle : null,
        hero_media_asset_id: typeof data.asset_id === 'string' ? data.asset_id : null,
        hero_public_url: typeof data.url === 'string' ? data.url : null,
        hero_kind: typeof data.kind === 'string' ? data.kind : null,
        thumbnail_url: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null,
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

function parseExperienceRow(row: Record<string, unknown>): Experience {
  const parseStringArr = (value: unknown): string[] => {
    if (typeof value === "string" && value) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed)
          ? parsed.filter(
              (item): item is string =>
                typeof item === "string" && item.trim().length > 0,
            )
          : [];
      } catch {
        return [];
      }
    }
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
    return [];
  };

  const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");

  let time_slots: string[] | null = null;
  if (row.time_slots && typeof row.time_slots === "string") {
    try {
      const parsed = JSON.parse(row.time_slots);
      time_slots = isStringArray(parsed) ? parsed : null;
    } catch {
      time_slots = null;
    }
  }

  let recurring_slots: Partial<Record<string, string[]>> | null = null;
  if (row.recurring_slots && typeof row.recurring_slots === "string") {
    try {
      const parsed = JSON.parse(row.recurring_slots);
      recurring_slots =
        parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
        Object.values(parsed).every(isStringArray)
          ? (parsed as Partial<Record<string, string[]>>)
          : null;
    } catch {
      recurring_slots = null;
    }
  }

  return {
    ...(row as unknown as Experience),
    status: row.status as Experience["status"],
    highlights: parseStringArr(row.highlights),
    included_items: parseStringArr(row.included_items),
    what_to_bring: parseStringArr(row.what_to_bring),
    meeting_point: row.meeting_point ?? null,
    time_slots,
    recurring_slots,
    featured: Boolean(row.featured),
  } as Experience;
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
  if (!db) throw createError({ statusCode: 503, statusMessage: "Database unavailable" });

  const rawToken = typeof query.token === "string" ? query.token : null;
  let isPreviewAuthorized = false;
  if (rawToken && env.PREVIEW_SECRET) {
    isPreviewAuthorized = await verifyPreviewToken(String(env.PREVIEW_SECRET), siteId, rawToken);
  }
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
  const includeMenu = requestedDatasets.has("menu");
  const blogSlug = typeof query.blogSlug === "string" ? query.blogSlug : null;
  const locale = typeof query.locale === "string" ? query.locale : undefined;

  // Validate query inputs before using KV cache — only allow known-safe values
  // to prevent unbounded cache entries from arbitrary variants.
  const VALID_DATASETS = new Set([
    'content', 'location', 'menu', 'reviews', 'photos', 'qa', 'posts',
    'blog', 'blogPost', 'experiences', 'experienceDetail',
    'reservationPolicies', 'experiencePolicies',
  ]);
  // Mirrors composables/usePublicPageRequest.ts's getPublicPageRequest() — the only
  // page values the frontend ever requests. A regex alone (e.g. /^[a-z0-9_-]+$/)
  // would still let an attacker mint unlimited distinct cache keys by varying
  // the page value; allowlisting against the real route set bounds that space.
  const VALID_PAGES = new Set([
    'home', 'locations', 'location', 'about', 'contact', 'reservations',
    'order', 'qa', 'reviews', 'posts', 'experiences', 'photos', 'menu', 'blog',
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
    throw createError({ statusCode: 400, statusMessage: "Invalid public page query" });
  }

  // Read-through KV cache for the D1 batch below. Skipped for preview-authorized
  // requests (isPreviewAuthorized gates the whole read/write, not just the key —
  // omitting the token from the key alone would let a preview response collide
  // with the public cache entry for the same page/location) and for preview/staging
  // hosts, whose D1 gets reseeded on every CI push —
  // a 60s-old cached response could serve pre-reseed content into a fresh E2E run.
  // Also skipped if any query input is invalid to prevent unbounded cache entries.
  const host = getHeader(event, "host") ?? "";
  const usePageCache = !isPreviewAuthorized && !isPreviewContext(host) && allInputsValid;
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

  const [{ site }, locationRow] = await Promise.all([
    loadPublicBase(event, siteId, { previewAuthorized: isPreviewAuthorized }),
    locationSlug
      ? queryFirst<{ id: string }>(
          db,
          `SELECT id FROM business_locations WHERE site_id = ? AND slug = ? AND status = 'active' LIMIT 1`,
          [siteId, locationSlug],
        )
      : Promise.resolve(null),
  ]);
  options.signal?.throwIfAborted();

  const orgId = site.organization_id;
  const locationId = locationRow?.id;

  // Pages that render the sitewide reviews list
  const needsGlobalReviews =
    requestedDatasets.has("reviews") && !locationSlug;
  // Pages that render the posts feed
  const needsGlobalPosts = requestedDatasets.has("posts") && !locationSlug;
  // Pages that display location hero images (cards or detail header)
  const needsLocations =
    requestedDatasets.has("reviews") ||
    requestedDatasets.has("location") ||
    requestedDatasets.has("menu") ||
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
  let idxMenus = -1,
    idxMenuItems = -1,
    idxMenuItemMedia = -1,
    idxMenuTranslations = -1,
    idxMenuItemTranslations = -1;
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

  // Menu data for the requested scope (all published menus/items + translations)
  if (includeMenu) {
    idxMenus = push(
      `SELECT id, organization_id, site_id, location_id, name, description, status, section_order,
              created_at, updated_at, created_by, updated_by
       FROM menus
       WHERE organization_id = ? AND site_id = ? AND status = 'published'`,
      [orgId, siteId],
    );

    idxMenuItems = push(
      `SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price_amount,
              mi.compare_at_price_amount, mi.sale_starts_at, mi.sale_ends_at,
              NULL AS image_asset_id, NULL AS public_url, NULL AS thumbnail_url, NULL AS kind, mi.available, mi.featured,
              mi.featured_sort_order, mi.sort_order, mi.allergens, mi.ingredients, mi.dietary_notes,
              mi.preparation, mi.serving_note,
              mi.seo_title, mi.seo_description, mi.canonical_url, mi.robots, ma_og.public_url AS og_image_public_url,
              mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
       FROM menu_items mi
       JOIN menus m ON m.id = mi.menu_id
       LEFT JOIN media_assets ma_og ON mi.og_image_asset_id = ma_og.id AND ma_og.status = 'active'
         AND ma_og.organization_id = m.organization_id AND ma_og.site_id = m.site_id
       WHERE m.organization_id = ? AND m.site_id = ? AND m.status = 'published'
       ORDER BY mi.sort_order, mi.name`,
      [orgId, siteId],
    );

    idxMenuItemMedia = push(
      `SELECT ma.*, mim.menu_item_id, mim.sort_order
       FROM menu_item_media mim
       JOIN menu_items mi ON mi.id = mim.menu_item_id
       JOIN menus m ON m.id = mi.menu_id
       JOIN media_assets ma ON ma.id = mim.asset_id
         AND ma.organization_id = mim.organization_id
         AND ma.site_id = mim.site_id
         AND ma.status = 'active'
       WHERE m.organization_id = ? AND m.site_id = ? AND m.status = 'published'
       ORDER BY mim.menu_item_id ASC, mim.sort_order ASC`,
      [orgId, siteId],
    );

    if (locale) {
      idxMenuTranslations = push(
        `SELECT menu_id, name, description, section_order
         FROM menu_translations
         WHERE organization_id = ? AND site_id = ? AND locale = ? AND status = 'published'`,
        [orgId, siteId, locale],
      );

      idxMenuItemTranslations = push(
        `SELECT mit.menu_item_id, mit.section, mit.name, mit.description, mit.allergens,
                mit.ingredients, mit.dietary_notes, mit.preparation, mit.serving_note
         FROM menu_item_translations mit
         JOIN menu_items mi ON mi.id = mit.menu_item_id
         JOIN menus m ON m.id = mi.menu_id
         WHERE m.organization_id = ? AND m.site_id = ? AND m.status = 'published'
           AND mit.locale = ? AND mit.status = 'published'`,
        [orgId, siteId, locale],
      );
    }
  }

  // Experiences remain route data. The page response also carries the shared
  // shell so the layout and route components consume one canonical resource.
  const needsExperiencesList =
    requestedDatasets.has("experiences") && !experienceSlug;

  if (needsExperiencesList) {
    const expParams: unknown[] = [orgId, siteId];
    let expSql = `SELECT e.id, e.organization_id, e.site_id, e.location_id,
                         e.title, e.slug, e.tagline, e.body,
                         e.price, e.price_amount, e.compare_at_price_amount, e.sale_starts_at, e.sale_ends_at, e.duration_minutes, e.max_capacity, e.time_slots, e.recurring_slots,
                         e.available_note, e.highlights, e.included_items, e.what_to_bring, e.meeting_point,
                         e.status, e.sort_order, e.featured, e.featured_sort_order,
                         e.seo_title, e.seo_description, e.canonical_url, e.robots, e.created_at, e.updated_at,
                         og.public_url AS og_image_public_url
                  FROM experiences e
                  LEFT JOIN media_assets og ON og.id = e.og_image_asset_id AND og.status = 'active'
         AND og.organization_id = e.organization_id AND og.site_id = e.site_id
                  WHERE e.organization_id = ? AND e.site_id = ? AND e.status != 'inactive'`;
    if (locationId) {
      expSql += ` AND e.location_id = ?`;
      expParams.push(locationId);
    }
    expSql += ` ORDER BY e.sort_order ASC, e.created_at ASC`;
    idxExperiencesList = push(expSql, expParams);
  }

  if (requestedDatasets.has("experienceDetail") && experienceSlug) {
    idxExperienceDetail = push(
      `SELECT e.id, e.organization_id, e.site_id, e.location_id,
              e.title, e.slug, e.tagline, e.body,
              e.price, e.price_amount, e.compare_at_price_amount, e.sale_starts_at, e.sale_ends_at, e.duration_minutes, e.max_capacity, e.time_slots, e.recurring_slots,
              e.available_note, e.highlights, e.included_items, e.what_to_bring, e.meeting_point,
              e.status, e.sort_order, e.featured, e.featured_sort_order,
              e.seo_title, e.seo_description, e.canonical_url, e.robots, e.created_at, e.updated_at,
              og.public_url AS og_image_public_url
       FROM experiences e
       LEFT JOIN media_assets og ON og.id = e.og_image_asset_id AND og.status = 'active'
         AND og.organization_id = e.organization_id AND og.site_id = e.site_id
       WHERE e.organization_id = ? AND e.site_id = ? AND e.slug = ?
       LIMIT 1`,
      [orgId, siteId, experienceSlug],
    );
  }

  // Conditional
  if (needsGlobalReviews)
    idxReviews = push(
      `SELECT r.author_name AS author, r.rating, r.content, r.created_at AS date,
              r.location_id, bl.title AS location_title
       FROM reviews r
       LEFT JOIN business_locations bl ON bl.id = r.location_id
       WHERE r.site_id = ? AND r.status = 'approved'
       ORDER BY r.created_at DESC LIMIT 50`,
      [siteId],
    );

  // Posts are fetched separately via getPublishedPosts() below, which returns the fully
  // formatted PublishedPostSummary shape (slug, canonical_url, gallery media) that this raw
  // row shape doesn't have — no point running an equivalent query here just to discard it.

  if (locationId && requestedDatasets.has("reviews"))
    idxLocReviews = push(
      `SELECT id, author_name, rating, content, created_at
       FROM reviews WHERE location_id = ? AND site_id = ? AND status = 'approved'
       ORDER BY created_at DESC LIMIT 3`,
      [locationId, siteId],
    );

  if (locationId && requestedDatasets.has("reviews"))
    idxFullReviews = push(
      `SELECT id, author_name, reviewer_photo_url, rating, title, content,
              owner_reply, owner_reply_at, photo_urls, source, created_at
       FROM reviews WHERE location_id = ? AND site_id = ? AND status = 'approved'
       ORDER BY created_at DESC LIMIT 50`,
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
        ? `SELECT id, public_url, thumbnail_url, alt_text, category, created_at, location_id
           FROM media_assets
           WHERE site_id = ? AND location_id = ? AND kind = 'image' AND status = 'active'
           ORDER BY created_at DESC LIMIT 100`
        : `SELECT id, public_url, thumbnail_url, alt_text, category, created_at, location_id
           FROM media_assets
           WHERE site_id = ? AND kind = 'image' AND status = 'active'
           ORDER BY created_at DESC LIMIT 100`,
      locationId ? [siteId, locationId] : [siteId],
    );

  if (requestedDatasets.has("blog"))
    idxBlogList = push(
      // read_time_minutes approximates words as body length / 5 chars at 200wpm —
      // avoids shipping the full post body to list views just to estimate read time.
      `SELECT p.id, p.title, p.slug, p.excerpt, p.category, p.seo_description, p.seo_keywords,
              p.canonical_url, p.robots, p.published_at, p.updated_at, p.featured_order,
              COALESCE(sa.name, u.name) AS author_name, p.featured_image_asset_id,
              ma.public_url, ma.kind, ma.width, ma.height,
              CAST(MAX(1, ROUND((LENGTH(COALESCE(p.body, '')) / 5.0) / 200.0)) AS INTEGER) AS read_time_minutes
       FROM blog_posts p
       LEFT JOIN user u ON u.id = p.author_id
       LEFT JOIN site_authors sa ON sa.id = p.site_author_id
       LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
       WHERE p.status = 'published' AND p.site_id = ? AND p.visibility = 'public'
       ORDER BY COALESCE(p.featured_order, 999999), p.published_at IS NULL, p.published_at DESC, p.id DESC
       LIMIT ?`,
      [siteId, page === "home" ? 3 : 50],
    );

  if (requestedDatasets.has("blogPost") && blogSlug)
    idxBlogPost = push(
      `SELECT p.id, p.title, p.slug, p.body, p.excerpt, p.category, p.seo_description, p.seo_keywords,
              p.canonical_url, p.robots, p.published_at, p.created_at, p.updated_at,
              p.featured_image_asset_id,
              COALESCE(sa.name, u.name) AS author_name, COALESCE(sma.public_url, u.image) AS author_image,
              sa.title AS author_title, sa.bio AS author_bio,
              ma.public_url, ma.kind, ma.width, ma.height
       FROM blog_posts p
       LEFT JOIN user u ON u.id = p.author_id
       LEFT JOIN site_authors sa ON sa.id = p.site_author_id
       LEFT JOIN media_assets sma ON sma.id = sa.image_asset_id AND sma.status = 'active'
       LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
       WHERE p.slug = ? AND p.site_id = ? AND p.status = 'published'
       LIMIT 1`,
      [blogSlug, siteId],
    );

  if (requestedDatasets.has("qa"))
    idxQa = push(
      locationId
        ? `SELECT id, question, question_author, question_date,
                  answer, answer_author, answer_date, is_owner_answer, upvote_count
           FROM location_qa
           WHERE location_id = ? AND site_id = ? AND status = 'published'
           ORDER BY is_owner_answer DESC, upvote_count DESC, sort_order, created_at`
        : `SELECT id, question, question_author, question_date,
                  answer, answer_author, answer_date, is_owner_answer, upvote_count
           FROM location_qa
           WHERE site_id = ? AND location_id IS NULL AND page_path IS NULL AND status = 'published'
           ORDER BY is_owner_answer DESC, upvote_count DESC, sort_order, created_at`,
      locationId ? [locationId, siteId] : [siteId],
    );

  // Single D1 round trip
  options.signal?.throwIfAborted();
  const batchResults = batchStmts.length > 0
    ? await executeBatch(db, batchStmts)
    : [];
  options.signal?.throwIfAborted();

  const shell = buildPublicShellPayload(site, batchResults, shellIndexes)

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
  const sourceLocale = site.source_locale;
  const canonicalPath = requestedDatasets.has('content') ? canonicalTenantPagePath(page, locationSlug) : null
  const tenantPage = canonicalPath
    ? await getPublicTenantPageForPath(db, siteId, canonicalPath, { locale, preview: isPreviewAuthorized })
    : null
  const contentRows: SiteContent[] = tenantPage ? tenantPageToContentRows(tenantPage) : []

  // Build active menu
  let menuData: MenuWithItems | null = null;
  if (includeMenu) {
    const menuRows =
      (batchResults[idxMenus] as { results: Record<string, unknown>[] })?.results ?? [];
    const menuItemRows =
      (batchResults[idxMenuItems] as { results: Record<string, unknown>[] })?.results ?? [];
    const menuItemMediaRows =
      (batchResults[idxMenuItemMedia] as { results: MenuItemMediaRow[] })?.results ?? [];
    const menuTranslations =
      (batchResults[idxMenuTranslations] as { results: MenuTranslationRow[] })?.results ?? [];
    const menuItemTranslations =
      (batchResults[idxMenuItemTranslations] as { results: MenuItemTranslationRow[] })?.results ?? [];

    let selectedMenuRow: Record<string, unknown> | null = null;

    const primaryLoc =
      (locRows.results ?? []).find((l) => l.is_primary) ??
      (locRows.results ?? [])[0] ??
      null;
    const effectiveLocationId = locationId ?? primaryLoc?.id ?? null;

    if (effectiveLocationId) {
      selectedMenuRow =
        menuRows.find((m) => m.location_id === effectiveLocationId) ?? null;
    }

    if (!selectedMenuRow) {
      selectedMenuRow =
        menuRows.find(
          (m) => m.location_id === null || m.location_id === undefined,
        ) ?? null;
    }

    if (selectedMenuRow) {
      const menuId = selectedMenuRow.id as string;
      const mappedMenu = mapMenu(selectedMenuRow);
      const menuTranslation = locale
        ? menuTranslations.find((t) => t.menu_id === menuId)
        : undefined;
      const sectionOrder = menuTranslation?.section_order
        ? normalizeSectionOrder(menuTranslation.section_order)
        : (mappedMenu.section_order ?? []);

      const itemTranslationsById = new Map(
        menuItemTranslations.map((t) => [t.menu_item_id, t]),
      );

      const mediaByMenuItem = new Map<string, ResolvedMediaAsset[]>();
      for (const row of menuItemMediaRows) {
        const list = mediaByMenuItem.get(row.menu_item_id) ?? [];
        list.push(toResolvedMediaAsset(row));
        mediaByMenuItem.set(row.menu_item_id, list);
      }
      const items = sortMenuItems(
        menuItemRows
          .filter((raw) => raw.menu_id === menuId)
          .map((raw) => {
            const mapped = mapMenuItem(raw);
            const media = mediaByMenuItem.get(mapped.id) ?? [];
            const item = {
              ...mapped,
              media,
              image_asset_id: media[0]?.id ?? null,
              public_url: media[0]?.public_url ?? null,
              thumbnail_url: media[0]?.thumbnail_url ?? null,
              kind: media[0]?.kind ?? null,
            };
            const t = itemTranslationsById.get(item.id);
            if (!t) return item;

            return {
              ...item,
              section: t.section ?? item.section,
              name: t.name ?? item.name,
              description: t.description ?? item.description,
              allergens:
                t.allergens !== null
                  ? parseStringArray(t.allergens)
                  : item.allergens,
              ingredients:
                t.ingredients !== null
                  ? parseStringArray(t.ingredients)
                  : item.ingredients,
              dietary_notes:
                t.dietary_notes !== null
                  ? parseStringArray(t.dietary_notes)
                  : item.dietary_notes,
              preparation: t.preparation ?? item.preparation,
              serving_note: t.serving_note ?? item.serving_note,
            };
          }),
        sectionOrder,
      );

      menuData = {
        ...mappedMenu,
        name: menuTranslation?.name ?? mappedMenu.name,
        description: menuTranslation?.description ?? mappedMenu.description,
        section_order: sectionOrder,
        items,
      };
    }
  }

  // Build experiences
  const experiencesListRaw: Experience[] =
    idxExperiencesList >= 0
      ? (
          (batchResults[idxExperiencesList] as { results: Record<string, unknown>[] })?.results ?? []
        ).map(parseExperienceRow)
      : [];
  options.signal?.throwIfAborted();
  const mediaByExperience = await hydrateMediaAssetsForExperiences(
    db,
    siteId,
    [
      ...experiencesListRaw.map(experience => experience.id),
      ...(idxExperienceDetail >= 0
        ? ((batchResults[idxExperienceDetail] as { results: Record<string, unknown>[] })?.results ?? [])
            .map(row => String(row.id ?? ""))
        : []),
    ],
  );
  const attachExperienceMedia = <T extends Experience>(experience: T): T => ({
    ...experience,
    media: mediaByExperience.get(experience.id) ?? [],
  });
  const experiencesWithMedia = experiencesListRaw.map(attachExperienceMedia);
  options.signal?.throwIfAborted();
  const availabilityContext = {
    locations: (locRows.results ?? []).map(location => ({
      id: String(location.id),
      special_hours: typeof location.special_hours === "string" ? location.special_hours : null,
      timezone: typeof location.timezone === "string" ? location.timezone : null,
    })),
    defaultTimezone: site.default_timezone ?? "UTC",
  };
  const experiencesList = requestedDatasets.has("experiences")
    ? await attachAvailabilitySummaries(db, orgId, siteId, experiencesWithMedia, availabilityContext)
    : experiencesWithMedia;

  const experienceDetailRaw: Experience | null =
    idxExperienceDetail >= 0
      ? (
          (batchResults[idxExperienceDetail] as { results: Record<string, unknown>[] })?.results[0] ?? null
        )
        ? parseExperienceRow(
            (batchResults[idxExperienceDetail] as { results: Record<string, unknown>[] }).results[0]!,
          )
        : null
      : null;
  // inactive experiences are never public, at any route — sold_out stays visible
  // with its own messaging (see server/utils/experiences.ts listExperiences).
  options.signal?.throwIfAborted();
  const experienceDetail =
    experienceDetailRaw && experienceDetailRaw.status !== "inactive"
      ? (await attachAvailabilitySummaries(
          db,
          orgId,
          siteId,
          [attachExperienceMedia(experienceDetailRaw)],
          availabilityContext,
        ))[0]
      : null;

  options.signal?.throwIfAborted();
  const [globalPublishedPosts, locationPublishedPosts] = await Promise.all([
    needsGlobalPosts ? getPublishedPosts(db, siteId, env, page === "posts" ? 50 : 6) : Promise.resolve([]),
    locationId && requestedDatasets.has("posts")
      ? getPublishedPosts(db, siteId, env, 50, locationId)
      : Promise.resolve([]),
  ]);

  // Shape locations
  const locations = (locRows.results ?? []).map((loc) => {
    const publicUrl = loc.hero_public_url as string | null;
    const thumbnailUrl = loc.hero_thumbnail_url as string | null;
    const heroKind = loc.hero_kind as string | null;
    const ogImagePublicUrl = loc.og_image_public_url as string | null;

    return {
      id: loc.id,
      slug: loc.slug,
      title: loc.title,
      address: parseJson(loc.address as string | null),
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
      opening_hours: parseJson(loc.opening_hours as string | null),
      special_hours: parseJson(loc.special_hours as string | null),
      timezone: loc.timezone || null,
      rating: loc.rating,
      review_count: loc.review_count,
      is_primary: Boolean(loc.is_primary),
      status: loc.status,
      public_url: publicUrl,
      kind: publicUrl ? heroKind : null,
      hero_public_url: publicUrl,
      thumbnail_url: thumbnailUrl,
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
      og_image_public_url: ogImagePublicUrl,
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
    throw createError({
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
  const reservationPolicySiteDefault = reservationPolicies
    ? renderBookingPolicySummary(reservationPolicies.site, policyLocale)
    : null;
  const reservationPolicyByLocation = Object.fromEntries(
    Array.from(reservationPolicies?.byLocation ?? [], ([locationId, policy]) => [
      locationId,
      renderBookingPolicySummary(policy, policyLocale),
    ]),
  );
  const experiencePolicySiteDefault = experiencePolicies
    ? renderBookingPolicySummary(experiencePolicies.site, policyLocale)
    : null;
  const experiencePolicyById = Object.fromEntries(
    Array.from(experiencePolicies?.byExperience ?? [], ([experienceId, policy]) => [
      experienceId,
      renderBookingPolicySummary(policy, policyLocale),
    ]),
  );

  // Shape full reviews (type A)
  const locationForAggregate = locationId
    ? ((locRows.results ?? []).find((l) => l.id === locationId) ?? null)
    : null;
  const fullReviews = (fullReviewRows?.results ?? []).map((r) => ({
    ...r,
    photo_urls: r.photo_urls
      ? (() => {
          try {
            return JSON.parse(r.photo_urls as string);
          } catch {
            return [];
          }
        })()
      : [],
  }));
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
  const photos = (photoRows?.results ?? []).map((asset, index) => ({
    id: asset.id,
    thumbnail_url: asset.thumbnail_url,
    local_url: asset.public_url,
    google_url: asset.public_url,
    description: asset.alt_text,
    category:
      PUBLIC_PHOTO_CATEGORY[String(asset.category || "other")] ?? "OTHER",
    sort_order: index,
    location_id: asset.location_id ?? null,
  }));

  // Shape blog list
  const blogList =
    idxBlogList >= 0
      ? (
          (batchResults[idxBlogList] as { results: ApiRecord[] })?.results ?? []
        ).map(attachFeaturedImageFromBareJoin)
      : [];

  // Shape blog post detail — content components require the post's id, so this
  // is one more D1 round trip server-side, but still a single client request.
  let blogPost: ApiRecord | null = null;
  if (idxBlogPost >= 0) {
    const postRow = (batchResults[idxBlogPost] as { results: ApiRecord[] })
      ?.results?.[0];
    if (postRow) {
      options.signal?.throwIfAborted();
      const components = await resolveContentComponentsMedia(
        db,
        await listContentComponents(db, "blog_post", String(postRow.id), {
          activeOnly: true,
        }),
      );
      blogPost = attachFeaturedImageFromBareJoin({ ...postRow, components });
    }
  }

  const pagePayload = {
    kind: page ?? 'home',
    success: true,
    shell,
    content: contentRows,
    content_blocks: groupContentBlocks(contentRows),
    tenant_page: tenantPage,
    menu: menuData,
    locationReviews: locationReviewRows?.results ?? [],
    globalReviews: needsGlobalReviews ? reviewRows.results ?? [] : [],
    reviewsAggregate: requestedDatasets.has("reviews") ? reviewsAggregate : null,
    reviewsList: requestedDatasets.has("reviews") ? fullReviews : [],
    photosList: requestedDatasets.has("photos") ? photos : [],
    qaList: requestedDatasets.has("qa") ? qaRows?.results ?? [] : [],
    blogList: requestedDatasets.has("blog") ? blogList : [],
    blogPost: requestedDatasets.has("blogPost") ? blogPost : null,
    postsList: requestedDatasets.has("posts") ? locationPublishedPosts : [],
    globalPosts: needsGlobalPosts ? globalPublishedPosts : [],
    reservationPolicySiteDefault,
    reservationPolicyByLocation,
    experiencePolicySiteDefault,
    experiencePolicyById,
    experiencesList,
    experienceDetail,
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
