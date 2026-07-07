// GET /api/public/sites/[siteId]/bootstrap
// Single SSR call per page type. Optional query params:
//   ?page=home|about|contact|location|reviews|photos|qa|...
//   ?location=slug          scope content to a location
//   ?menu=1                 include active menu items
//   ?data=reviews|photos|qa include full page-specific dataset (type A/E/F)
// All inline D1 queries run in a single executeBatch() call.
import { executeBatch, queryFirst, type BatchQuery } from "~/server/db";
import { cloudflareEnv, jsonResponse } from "~/server/utils/api-response";
import { calculateMapEmbedUrl } from "~/server/utils/google-business";
import { type SiteContent } from "~/server/utils/content-management";
import {
  mapMenu,
  mapMenuItem,
  sortMenuItems,
  normalizeSectionOrder,
  parseStringArray,
} from "~/server/utils/menu-management";
import { verifyPreviewToken } from "~/server/utils/preview-token";
import { attachAvailabilitySummaries, type Experience } from "~/server/utils/experiences";
import { type MenuWithItems } from "~/server/types/menu";
import {
  attachFeaturedImageFromBareJoin,
  listContentComponents,
  resolveContentComponentsMedia,
} from "~/server/utils/platform-content";
import {
  buildBootstrapCacheKey,
  getBootstrapCache,
  putBootstrapCache,
} from "~/server/utils/bootstrap-cache";
import {
  renderBookingPolicySummary,
  resolveBookingPolicy,
} from "~/server/utils/booking-policies";
import { getCloudflareWaitUntil } from "~/server/utils/mcp-route-helpers";
import { isPreviewContext } from "~/server/utils/tenant-hosts";
import { getOwnerEmail } from "~/server/utils/notifications";
import { getPublishedPosts } from "~/server/utils/post-management";

function groupContentBlocks(rows: SiteContent[]): Array<SiteContent & { _section: string }> {
  const groups: Record<string, SiteContent & { _section: string }> = {}
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

interface ContentSourceRow extends SiteContent {
  media_public_url: string | null;
  media_kind: string | null;
}

interface ContentTranslationRow {
  field: string;
  content: string | null;
  value: string | null;
  type: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  component: string | null;
  updated_at: string;
  media_public_url: string | null;
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

const parseJson = (raw: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

function resolveContentMedia(row: ContentSourceRow): SiteContent {
  const { media_public_url, ...rest } = row as unknown as Record<
    string,
    unknown
  >;
  if (rest.type === "media" && media_public_url) {
    rest.value = media_public_url;
    rest.content = media_public_url;
  }
  return rest as unknown as SiteContent;
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

  let images: Array<{ url: string; kind: "image" | "video" }> = [];
  if (row.images && typeof row.images === "string") {
    try {
      const parsed = JSON.parse(row.images);
      if (Array.isArray(parsed)) {
        images = parsed.filter(
          (item: unknown) =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as { url: unknown }).url === "string" &&
            ((item as { kind: string }).kind === "image" ||
              (item as { kind: string }).kind === "video"),
        ) as Array<{ url: string; kind: "image" | "video" }>;
      }
    } catch {
      images = [];
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
    images,
    featured: Boolean(row.featured),
  } as Experience;
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, "siteId");
  if (!siteId)
    return jsonResponse({ error: "siteId required" }, { status: 400 });

  const env = cloudflareEnv(event);
  const db = env.DB;
  if (!db)
    return jsonResponse({ error: "Database unavailable" }, { status: 503 });

  const query = getQuery(event);

  const rawToken = typeof query.token === "string" ? query.token : null;
  let isPreviewAuthorized = false;
  if (rawToken && env.PREVIEW_SECRET) {
    isPreviewAuthorized = await verifyPreviewToken(String(env.PREVIEW_SECRET), siteId, rawToken);
  }

  setHeader(
    event,
    "cache-control",
    isPreviewAuthorized
      ? "private, no-store"
      : "public, max-age=60, stale-while-revalidate=300",
  );
  const page = typeof query.page === "string" ? query.page : null;
  const locationSlug =
    typeof query.location === "string" ? query.location : null;
  const experienceSlug =
    typeof query.experience === "string" ? query.experience : null;
  const includeMenu = query.menu === "1" || query.menu === "true";
  const dataType = typeof query.data === "string" ? query.data : null; // 'reviews' | 'photos' | 'qa' | 'blog' | 'blogPost'
  const blogSlug = typeof query.blogSlug === "string" ? query.blogSlug : null;
  const locale = typeof query.locale === "string" ? query.locale : undefined;

  // Validate query inputs before using KV cache — only allow known-safe values
  // to prevent unbounded cache entries from arbitrary variants.
  const VALID_DATA_TYPES = new Set(['reviews', 'photos', 'qa', 'blog', 'blogPost', 'posts']);
  // Mirrors composables/useBootstrapParams.ts's getBootstrapParams() — the only
  // page values the frontend ever requests. A regex alone (e.g. /^[a-z0-9_-]+$/)
  // would still let an attacker mint unlimited distinct cache keys by varying
  // the page value; allowlisting against the real route set bounds that space.
  const VALID_PAGES = new Set([
    'home', 'locations', 'location', 'about', 'contact', 'reservations',
    'order', 'qa', 'reviews', 'posts', 'experiences', 'photos', 'menu', 'blog',
  ]);
  const isValidDataType = dataType === null || VALID_DATA_TYPES.has(dataType);
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

  const allInputsValid = isValidDataType && isValidLocale && isValidPage &&
    isValidLocation && isValidExperience && isValidBlogSlug;

  // Read-through KV cache for the D1 batch below. Skipped for preview-authorized
  // requests (isPreviewAuthorized gates the whole read/write, not just the key —
  // omitting the token from the key alone would let a preview response collide
  // with the public cache entry for the same page/location) and for preview/staging
  // hosts, whose D1 gets reseeded on every CI push (see CLAUDE.md's E2E architecture) —
  // a 60s-old cached response could serve pre-reseed content into a fresh E2E run.
  // Also skipped if any query input is invalid to prevent unbounded cache entries.
  const host = getHeader(event, "host") ?? "";
  const useBootstrapCache = !isPreviewAuthorized && !isPreviewContext(host) && allInputsValid;
  const cacheKey = buildBootstrapCacheKey(siteId, {
    page,
    location: locationSlug,
    experience: experienceSlug,
    menu: includeMenu,
    data: dataType,
    blogSlug,
    locale,
  });
  if (useBootstrapCache) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kv = (env as any).SITE_CACHE as KVNamespace | undefined;
    if (kv) {
      const cached = await getBootstrapCache(kv, cacheKey);
      if (cached) {
        try {
          setHeader(event, "x-bootstrap-cache", "HIT");
          return jsonResponse(JSON.parse(cached));
        } catch {
          // Invalid cached JSON — treat as a miss and regenerate
        }
      }
      setHeader(event, "x-bootstrap-cache", "MISS");
    } else {
      setHeader(event, "x-bootstrap-cache", "NO-KV");
    }
  } else {
    setHeader(event, "x-bootstrap-cache", "SKIP");
  }

  // Parallelize site auth + location slug resolution — both only need siteId
  const [site, locationRow] = await Promise.all([
    queryFirst<{
      id: string;
      organization_id: string;
      default_currency: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      brand_name: string | null;
      brand_description: string | null;
      logo_url: string | null;
      og_image_url: string | null;
    }>(
      db,
      `SELECT s.id, s.organization_id, s.default_currency, s.contact_email, s.contact_phone, s.brand_name,
              s.brand_description, COALESCE(ma_logo.public_url, s.logo_url) AS logo_url,
              ma_og.public_url AS og_image_url
         FROM sites s
         LEFT JOIN media_assets ma_logo ON s.logo_asset_id = ma_logo.id AND ma_logo.status = 'active'
         LEFT JOIN media_assets ma_og ON s.og_image_asset_id = ma_og.id AND ma_og.status = 'active'
        WHERE s.id = ? AND s.status = 'active'${isPreviewAuthorized ? "" : " AND s.onboarding_status = 'active'"}
        LIMIT 1`,
      [siteId],
    ),
    locationSlug
      ? queryFirst<{ id: string }>(
          db,
          `SELECT id FROM business_locations WHERE site_id = ? AND slug = ? AND status = 'active' LIMIT 1`,
          [siteId, locationSlug],
        )
      : Promise.resolve(null),
  ]);

  if (!site) return jsonResponse({ error: "Site not found" }, { status: 404 });
  const orgId = site.organization_id;
  const locationId = locationRow?.id;

  // Pages that render the sitewide reviews list
  const needsGlobalReviews =
    page === "home" || (page === "reviews" && !locationSlug);
  // Pages that render the posts feed
  const needsGlobalPosts = page === "home" || page === "posts";
  // Pages that display location hero images (cards or detail header)
  const needsLocationHeroMedia =
    !page ||
    page === "home" ||
    page === "reservations" ||
    page === "locations" ||
    page === "photos" ||
    !!locationSlug;

  // Build batch — one subrequest to D1 for all inline queries
  const batchStmts: BatchQuery[] = [];
  let idxLoc = -1,
    idxConfig = -1,
    idxLocale = -1,
    idxExpCount = -1;
  let idxReviews = -1,
    idxLocReviews = -1;
  let idxFullReviews = -1,
    idxPhotos = -1,
    idxQa = -1;
  let idxSourceContent = -1,
    idxContentTranslations = -1;
  let idxMenus = -1,
    idxMenuItems = -1,
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

  // Always — locations with or without hero media JOINs
  idxLoc = push(
    needsLocationHeroMedia
      ? `SELECT bl.id, bl.slug, bl.title, bl.address, bl.phone, bl.email, bl.website_url, bl.maps_url,
                 bl.latitude, bl.longitude, bl.opening_hours, bl.special_hours, bl.timezone, bl.rating, bl.review_count,
                 bl.is_primary, bl.status, bl.city, bl.neighborhood,
                 bl.grab_url, bl.uber_eats_url, bl.foodpanda_url,
                 bl.description, bl.short_description, bl.last_synced_at,
                 ma_img.public_url AS hero_image_public_url,
                 ma_vid.public_url AS hero_video_public_url,
                 ma_vid.thumbnail_url
          FROM business_locations bl
          LEFT JOIN media_assets ma_img ON bl.hero_image_asset_id = ma_img.id AND ma_img.status = 'active'
          LEFT JOIN media_assets ma_vid ON bl.hero_video_asset_id = ma_vid.id AND ma_vid.status = 'active'
          WHERE bl.organization_id = ? AND bl.site_id = ? AND bl.status = 'active'
          ORDER BY bl.is_primary DESC, bl.title ASC`
      : `SELECT bl.id, bl.slug, bl.title, bl.address, bl.phone, bl.email, bl.website_url, bl.maps_url,
                 bl.latitude, bl.longitude, bl.opening_hours, bl.special_hours, bl.timezone, bl.rating, bl.review_count,
                 bl.is_primary, bl.status, bl.city, bl.neighborhood,
                 bl.grab_url, bl.uber_eats_url, bl.foodpanda_url,
                 bl.description, bl.short_description, bl.last_synced_at,
                 NULL AS hero_image_public_url, NULL AS hero_video_public_url,
                 NULL AS thumbnail_url
          FROM business_locations bl
          WHERE bl.organization_id = ? AND bl.site_id = ? AND bl.status = 'active'
          ORDER BY bl.is_primary DESC, bl.title ASC`,
    [orgId, siteId],
  );

  idxConfig = push(
    `SELECT key, value FROM site_config WHERE organization_id = ? AND site_id = ?`,
    [orgId, siteId],
  );

  idxLocale = push(
    `SELECT locale, label, is_source, status
     FROM site_locales
     WHERE organization_id = ? AND site_id = ?
       AND (is_source = 1 OR status = 'published')
     ORDER BY is_source DESC, locale ASC`,
    [orgId, siteId],
  );

  idxExpCount = push(
    `SELECT COUNT(*) AS cnt FROM experiences WHERE site_id = ? AND status != 'inactive'`,
    [siteId],
  );

  // Content for the requested page (source + translations)
  if (page) {
    const contentParams: unknown[] = [orgId, siteId, page];
    if (locationId) contentParams.push(locationId);

    idxSourceContent = push(
      `SELECT sc.id, sc.organization_id, sc.site_id, sc.location_id, sc.page, sc.field,
              sc.value, sc.type, sc.source, sc.content, sc.hero_title, sc.hero_subtitle,
              sc.hero_image_asset_id, sc.hero_video_asset_id, sc.component, sc.updated_at,
              img.public_url AS hero_public_url, img.kind AS hero_kind,
              vid.public_url AS hero_video_public_url, vid.kind AS hero_video_kind,
              vid.thumbnail_url,
              ma.public_url AS media_public_url, ma.kind AS media_kind
       FROM site_content sc
       LEFT JOIN media_assets img ON sc.hero_image_asset_id = img.id AND img.status = 'active'
       LEFT JOIN media_assets vid ON sc.hero_video_asset_id = vid.id AND vid.status = 'active'
       LEFT JOIN media_assets ma ON sc.type = 'media'
         AND ma.id = COALESCE(
           CASE WHEN sc.content NOT LIKE 'http%' AND length(sc.content) > 0 THEN sc.content END,
           CASE WHEN sc.value NOT LIKE 'http%' AND length(sc.value) > 0 THEN sc.value END
         )
         AND ma.status = 'active'
       WHERE sc.organization_id = ? AND sc.site_id = ? AND sc.page = ?
         AND sc.location_id ${locationId ? "= ?" : "IS NULL"}
       ORDER BY sc.field`,
      contentParams,
    );

    if (locale) {
      const translationParams: unknown[] = [orgId, siteId, page, locale];
      if (locationId) translationParams.push(locationId);

      idxContentTranslations = push(
        `SELECT sct.field, sct.content, sct.value, sct.type, sct.hero_title, sct.hero_subtitle,
                sct.component, sct.updated_at, ma.public_url AS media_public_url, ma.kind AS media_kind
         FROM site_content_translations sct
         LEFT JOIN media_assets ma ON sct.type = 'media'
           AND ma.id = COALESCE(
             CASE WHEN sct.content NOT LIKE 'http%' AND length(sct.content) > 0 THEN sct.content END,
             CASE WHEN sct.value NOT LIKE 'http%' AND length(sct.value) > 0 THEN sct.value END
           )
           AND ma.status = 'active'
         WHERE sct.organization_id = ? AND sct.site_id = ? AND sct.page = ?
           AND sct.locale = ? AND sct.status = 'published'
           AND sct.location_id ${locationId ? "= ?" : "IS NULL"}`,
        translationParams,
      );
    }
  }

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
              mi.image_asset_id, ma.public_url, ma.thumbnail_url, ma.kind, mi.available, mi.featured,
              mi.featured_sort_order, mi.sort_order, mi.allergens, mi.ingredients, mi.dietary_notes,
              mi.preparation, mi.serving_note, mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
       FROM menu_items mi
       JOIN menus m ON m.id = mi.menu_id
       LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
       WHERE m.organization_id = ? AND m.site_id = ? AND m.status = 'published'
       ORDER BY mi.sort_order, mi.name`,
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

  // Experiences list + detail (mutually exclusive with the query conditions above)
  const needsExperiencesList =
    (page === "experiences" && !experienceSlug) ||
    page === "home" ||
    page === "location";

  if (needsExperiencesList) {
    const expParams: unknown[] = [orgId, siteId];
    let expSql = `SELECT e.id, e.organization_id, e.site_id, e.location_id,
                         e.title, e.slug, e.tagline, e.body, e.image_asset_id,
                         e.video_asset_id, e.images,
                         e.price, e.price_amount, e.compare_at_price_amount, e.sale_starts_at, e.sale_ends_at, e.duration_minutes, e.max_capacity, e.time_slots, e.recurring_slots,
                         e.available_note, e.highlights, e.included_items, e.what_to_bring, e.meeting_point,
                         e.status, e.sort_order, e.featured, e.featured_sort_order,
                         e.seo_title, e.seo_description, e.created_at, e.updated_at,
                         img.public_url AS image_url, vid.public_url AS video_url
                  FROM experiences e
                  LEFT JOIN media_assets img ON img.id = e.image_asset_id AND img.status = 'active'
                  LEFT JOIN media_assets vid ON vid.id = e.video_asset_id AND vid.status = 'active'
                  WHERE e.organization_id = ? AND e.site_id = ? AND e.status != 'inactive'`;
    if (page === "location" && locationId) {
      expSql += ` AND e.location_id = ?`;
      expParams.push(locationId);
    }
    expSql += ` ORDER BY e.sort_order ASC, e.created_at ASC`;
    idxExperiencesList = push(expSql, expParams);
  }

  if (page === "experiences" && experienceSlug) {
    idxExperienceDetail = push(
      `SELECT e.id, e.organization_id, e.site_id, e.location_id,
              e.title, e.slug, e.tagline, e.body, e.image_asset_id,
              e.video_asset_id, e.images,
              e.price, e.price_amount, e.compare_at_price_amount, e.sale_starts_at, e.sale_ends_at, e.duration_minutes, e.max_capacity, e.time_slots, e.recurring_slots,
              e.available_note, e.highlights, e.included_items, e.what_to_bring, e.meeting_point,
              e.status, e.sort_order, e.featured, e.featured_sort_order,
              e.seo_title, e.seo_description, e.created_at, e.updated_at,
              img.public_url AS image_url, vid.public_url AS video_url
       FROM experiences e
       LEFT JOIN media_assets img ON img.id = e.image_asset_id AND img.status = 'active'
       LEFT JOIN media_assets vid ON vid.id = e.video_asset_id AND vid.status = 'active'
       WHERE e.organization_id = ? AND e.site_id = ? AND e.slug = ?
       LIMIT 1`,
      [orgId, siteId, experienceSlug],
    );
  }

  // Conditional
  if (needsGlobalReviews)
    idxReviews = push(
      `SELECT author_name AS author, rating, content, created_at AS date
       FROM reviews WHERE site_id = ? AND status = 'approved'
       ORDER BY created_at DESC LIMIT 50`,
      [siteId],
    );

  if (locationId)
    idxLocReviews = push(
      `SELECT id, author_name, rating, content, created_at
       FROM reviews WHERE location_id = ? AND site_id = ? AND status = 'approved'
       ORDER BY created_at DESC LIMIT 3`,
      [locationId, siteId],
    );

  if (locationId && dataType === "reviews")
    idxFullReviews = push(
      `SELECT id, author_name, reviewer_photo_url, rating, title, content,
              owner_reply, owner_reply_at, photo_urls, source, created_at
       FROM reviews WHERE location_id = ? AND site_id = ? AND status = 'approved'
       ORDER BY created_at DESC LIMIT 50`,
      [locationId, siteId],
    );

  if (dataType === "photos")
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

  if (dataType === "blog")
    idxBlogList = push(
      `SELECT p.id, p.title, p.slug, p.excerpt, p.category, p.seo_description, p.seo_keywords,
              p.canonical_url, p.robots, p.published_at, p.featured_image_asset_id,
              ma.public_url, ma.kind, ma.width, ma.height
       FROM blog_posts p
       LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
       WHERE p.status = 'published' AND p.site_id = ?
       ORDER BY p.published_at IS NULL, p.published_at DESC, p.id DESC
       LIMIT 50`,
      [siteId],
    );

  if (dataType === "blogPost" && blogSlug)
    idxBlogPost = push(
      `SELECT p.id, p.title, p.slug, p.body, p.excerpt, p.category, p.seo_description, p.seo_keywords,
              p.canonical_url, p.robots, p.published_at, p.created_at, p.updated_at,
              p.featured_image_asset_id,
              u.name AS author_name, u.image AS author_image,
              ma.public_url, ma.kind, ma.width, ma.height
       FROM blog_posts p
       LEFT JOIN user u ON u.id = p.author_id
       LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
       WHERE p.slug = ? AND p.site_id = ? AND p.status = 'published'
       LIMIT 1`,
      [blogSlug, siteId],
    );

  if (dataType === "qa")
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
           WHERE site_id = ? AND status = 'published'
           ORDER BY is_owner_answer DESC, upvote_count DESC, sort_order, created_at`,
      locationId ? [locationId, siteId] : [siteId],
    );

  // Single D1 round trip
  const batchResults = await executeBatch(db, batchStmts);

  // Extract batch results by tracked index
  const locRows = batchResults[idxLoc] as { results: Record<string, unknown>[] };
  const configRows = batchResults[idxConfig] as {
    results: { key: string; value: string }[];
  };
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
  const photoRows =
    idxPhotos >= 0
      ? (batchResults[idxPhotos] as { results: Record<string, unknown>[] })
      : { results: [] as Record<string, unknown>[] };
  const qaRows =
    idxQa >= 0
      ? (batchResults[idxQa] as { results: Record<string, unknown>[] })
      : { results: [] as Record<string, unknown>[] };
  const localeRows = batchResults[idxLocale] as {
    results: {
      locale: string;
      label: string | null;
      is_source: number;
      status: string;
    }[];
  };
  const experienceCountVal =
    (
      batchResults[idxExpCount]?.results?.[0] as
        | { cnt: number }
        | undefined
    )?.cnt ?? 0;

  const sourceLocale = (localeRows.results ?? []).find((l) => l.is_source)?.locale;

  // Build content rows
  const buildContentRows = (
    sourceRows: ContentSourceRow[],
    translationRows: ContentTranslationRow[],
  ): SiteContent[] => {
    if (!locale || locale === sourceLocale) {
      return sourceRows.map(resolveContentMedia);
    }

    const sourceByField = new Map(
      sourceRows.map((row) => [row.field, { ...row }]),
    );

    for (const t of translationRows) {
      const base = sourceByField.get(t.field);
      const translationHasMediaValue =
        t.value !== null || t.content !== null;
      const mediaPublicUrl = translationHasMediaValue
        ? t.media_public_url
        : (t.media_public_url ?? base?.media_public_url ?? null);

      const merged: ContentSourceRow = {
        ...(base ?? ({
          id: `translation::${orgId}::${siteId}::${locationId ?? "site"}::${locale}::${page}::${t.field}`,
          organization_id: orgId,
          site_id: siteId,
          location_id: locationId,
          page: page!,
          field: t.field,
          source: "manual",
          hero_image_asset_id: undefined,
          hero_video_asset_id: undefined,
        } as unknown as SiteContent)),
        field: t.field,
        value: (t.value ?? t.content ?? base?.value) as string | undefined,
        content: (t.content ?? t.value ?? base?.content) as string | undefined,
        type: (t.type ?? base?.type ?? "text") as string,
        hero_title: (t.hero_title ?? base?.hero_title) as string | null | undefined,
        hero_subtitle: (t.hero_subtitle ?? base?.hero_subtitle) as string | null | undefined,
        component: (t.component ?? base?.component) as string | null | undefined,
        updated_at: t.updated_at,
        media_public_url: mediaPublicUrl,
        media_kind: null,
      } as ContentSourceRow;

      sourceByField.set(t.field, merged);
    }

    return Array.from(sourceByField.values())
      .map(resolveContentMedia)
      .sort((a, b) => a.field.localeCompare(b.field));
  };

  const contentRows: SiteContent[] =
    idxSourceContent >= 0
      ? buildContentRows(
          (batchResults[idxSourceContent] as { results: ContentSourceRow[] }).results ?? [],
          (batchResults[idxContentTranslations] as { results: ContentTranslationRow[] })?.results ?? [],
        )
      : [];

  // Build active menu
  let menuData: MenuWithItems | null = null;
  if (includeMenu) {
    const menuRows =
      (batchResults[idxMenus] as { results: Record<string, unknown>[] })?.results ?? [];
    const menuItemRows =
      (batchResults[idxMenuItems] as { results: Record<string, unknown>[] })?.results ?? [];
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

      const items = sortMenuItems(
        menuItemRows
          .filter((raw) => raw.menu_id === menuId)
          .map((raw) => {
            const item = mapMenuItem(raw);
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
  const experiencesList = await attachAvailabilitySummaries(db, orgId, siteId, experiencesListRaw);

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
  const experienceDetail =
    experienceDetailRaw && experienceDetailRaw.status !== "inactive"
      ? (await attachAvailabilitySummaries(db, orgId, siteId, [experienceDetailRaw]))[0]
      : null;

  // Locations rarely have their own email (Google Places API doesn't expose
  // one) — fall back to the site's contact email, then the org owner's
  // account email, so guests always have a way to reach someone.
  const anyLocationMissingEmail = (locRows.results ?? []).some((loc) => !loc.email);
  const fallbackEmail =
    site.contact_email ??
    (anyLocationMissingEmail ? await getOwnerEmail(db, site.organization_id) : null);
  const globalPublishedPosts = needsGlobalPosts
    ? await getPublishedPosts(db, siteId, page === "posts" ? 50 : 6)
    : [];
  const locationPublishedPosts = locationId && dataType === "posts"
    ? await getPublishedPosts(db, siteId, 50, locationId)
    : [];

  // Shape locations
  const locations = (locRows.results ?? []).map((loc) => {
    const heroVideoUrl = loc.hero_video_public_url as string | null;
    const heroImageUrl = loc.hero_image_public_url as string | null;
    const thumbnailUrl = loc.thumbnail_url as string | null;
    const publicUrl = heroVideoUrl || heroImageUrl || null;

    return {
      id: loc.id,
      slug: loc.slug,
      title: loc.title,
      address: parseJson(loc.address as string | null),
      phone: loc.phone,
      email: (loc.email as string | null) ?? fallbackEmail,
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
      kind: publicUrl ? (heroVideoUrl ? "video" : "image") : null,
      hero_image_public_url: heroImageUrl,
      hero_video_public_url: heroVideoUrl,
      thumbnail_url: thumbnailUrl,
      city: loc.city,
      neighborhood: loc.neighborhood || null,
      short_description: loc.short_description || null,
      description: loc.description || null,
      grab_url: loc.grab_url || null,
      uber_eats_url: loc.uber_eats_url || null,
      foodpanda_url: loc.foodpanda_url || null,
    };
  });

  const config = Object.fromEntries(
    (configRows.results ?? []).map(({ key, value }) => [key, value]),
  );
  config.default_currency = site.default_currency || "THB";
  if (site.contact_email) config.contact_email = site.contact_email;
  if (site.contact_phone) config.contact_phone = site.contact_phone;
  if (site.brand_name) config.brand_name = site.brand_name;
  if (site.brand_description) config.brand_description = site.brand_description;
  if (site.logo_url) config.logo_url = site.logo_url;
  if (site.og_image_url) config.og_image_url = site.og_image_url;

  const primary =
    (locRows.results ?? []).find((l) => l.is_primary) ??
    locRows.results?.[0] ??
    null;

  const googleBusiness = {
    business: primary
      ? {
          title: primary.title,
          city: primary.city,
          storefrontAddress: parseJson(primary.address as string | null),
          phoneNumbers: primary.phone ? [{ phoneNumber: primary.phone }] : [],
          websiteUri: primary.website_url,
          mapsUri: primary.maps_url,
          latlng:
            primary.latitude && primary.longitude
              ? { latitude: primary.latitude, longitude: primary.longitude }
              : null,
          profile: { description: primary.description },
          reviewSummary:
            primary.last_synced_at && primary.rating != null && primary.review_count != null
              ? {
                  averageRating: primary.rating,
                  totalReviewCount: primary.review_count,
                }
              : null,
        }
      : null,
    reviews: reviewRows.results ?? [],
    media: [],
    posts: globalPublishedPosts,
    syncedAt: primary?.last_synced_at ?? null,
  };

  const reservationPolicySiteDefault = renderBookingPolicySummary(
    await resolveBookingPolicy(db, {
      siteId,
      policyType: "reservation",
    }),
    locale ?? "en",
  );

  const reservationPolicyByLocation = Object.fromEntries(
    await Promise.all(
      locations.map(async (location) => [
        String(location.id),
        renderBookingPolicySummary(
          await resolveBookingPolicy(db, {
            siteId,
            policyType: "reservation",
            locationId: String(location.id),
          }),
          locale ?? "en",
        ),
      ]),
    ),
  );

  const experiencePolicySiteDefault = renderBookingPolicySummary(
    await resolveBookingPolicy(db, {
      siteId,
      policyType: "experience",
    }),
    locale ?? "en",
  );

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

  const experiencePolicyById = Object.fromEntries(
    await Promise.all(
      Array.from(experiencePolicyTargets.entries()).map(async ([experienceId, target]) => [
        experienceId,
        renderBookingPolicySummary(
          await resolveBookingPolicy(db, {
            siteId,
            policyType: "experience",
            locationId: target.locationId,
            experienceId,
          }),
          locale ?? "en",
        ),
      ]),
    ),
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
  const reviewsDist = [1, 2, 3, 4, 5].map((star) => ({
    star,
    count: fullReviews.filter((r) => r.rating === star).length,
  }));

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
      const components = await resolveContentComponentsMedia(
        db,
        await listContentComponents(db, "blog_post", String(postRow.id), {
          activeOnly: true,
        }),
      );
      blogPost = attachFeaturedImageFromBareJoin({ ...postRow, components });
    }
  }

  const payload = {
    success: true,
    locations,
    config,
    googleBusiness,
    content: contentRows,
    content_blocks: groupContentBlocks(contentRows),
    menu: menuData,
    locationReviews: locationReviewRows?.results ?? [],
    count: locations.length,
    // Type A — full reviews for /locations/[slug]/reviews
    ...(dataType === "reviews"
      ? {
          reviewsAggregate:
            locationForAggregate?.last_synced_at &&
            locationForAggregate.rating != null &&
            locationForAggregate.review_count != null
              ? {
                  rating: locationForAggregate.rating,
                  review_count: locationForAggregate.review_count,
                  distribution: reviewsDist,
                }
              : null,
          reviewsList: fullReviews,
        }
      : {}),
    // Type E — photos for /locations/[slug]/photos
    ...(dataType === "photos" ? { photosList: photos } : {}),
    // Type F — Q&A for /locations/[slug]/qa
    ...(dataType === "qa" ? { qaList: qaRows?.results ?? [] } : {}),
    // Blog list for /blog
    ...(dataType === "blog" ? { blogList } : {}),
    // Blog post detail for /blog/[slug]
    ...(dataType === "blogPost" ? { blogPost } : {}),
    // Type G — posts for /locations/[slug]/posts
    ...(dataType === "posts"
      ? {
          postsList: locationPublishedPosts,
        }
      : {}),
    // Site locales + experiences — always included for header/nav
    locales: (localeRows?.results ?? []).map((l) => ({
      code: l.locale,
      label: l.label ?? l.locale,
      is_source: Boolean(l.is_source),
    })),
    reservationPolicySiteDefault,
    reservationPolicyByLocation,
    experiencePolicySiteDefault,
    experiencePolicyById,
    hasExperiences: experienceCountVal > 0,
    experiencesList,
    experienceDetail,
  };

  // Slug-shaped inputs are only worth caching once they've resolved to a real
  // row — otherwise a stream of made-up slugs (still regex-valid) would each
  // mint their own permanent KV entry. locationRow/experienceDetail/blogPost
  // are the actual D1-resolved lookups for locationSlug/experienceSlug/blogSlug.
  const resolvedSlugsValid =
    (!locationSlug || !!locationRow) &&
    (!experienceSlug || !!experienceDetail) &&
    (!blogSlug || !!blogPost);

  if (useBootstrapCache && resolvedSlugsValid) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kv = (env as any).SITE_CACHE as KVNamespace | undefined;
    if (kv) {
      const putAsync = putBootstrapCache(kv, cacheKey, JSON.stringify(payload)).catch(
        (err: unknown) => {
          console.warn("[bootstrap-cache] put failed:", String(err));
        },
      );
      const waitUntil = getCloudflareWaitUntil(event);
      if (waitUntil) waitUntil(putAsync);
    }
  }

  return jsonResponse(payload);
});
