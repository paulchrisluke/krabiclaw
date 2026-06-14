// GET /api/public/sites/[siteId]/bootstrap
// Single SSR call per page type. Optional query params:
//   ?page=home|about|contact|location|reviews|photos|qa|...
//   ?location=slug          scope content to a location
//   ?menu=1                 include active menu items
//   ?data=reviews|photos|qa include full page-specific dataset (type A/E/F)
// All inline D1 queries run in a single db.batch() call alongside helper functions.
import { cloudflareEnv, jsonResponse } from "~/server/utils/api-response";
import { calculateMapEmbedUrl } from "~/server/utils/google-business";
import { getPublishedPageContentForLocale, type SiteContent } from "~/server/utils/content-management";
import { getActiveMenu } from "~/server/utils/menu-management";
import {
  getExperienceBySlug,
  listExperiences,
} from "~/server/utils/experiences";

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

const parseJson = (raw: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export default defineEventHandler(async (event) => {
  setHeader(
    event,
    "cache-control",
    "public, max-age=60, stale-while-revalidate=300",
  );

  const siteId = getRouterParam(event, "siteId");
  if (!siteId)
    return jsonResponse({ error: "siteId required" }, { status: 400 });

  const env = cloudflareEnv(event);
  const db = env.DB;
  if (!db)
    return jsonResponse({ error: "Database unavailable" }, { status: 503 });

  const query = getQuery(event);
  const page = typeof query.page === "string" ? query.page : null;
  const locationSlug =
    typeof query.location === "string" ? query.location : null;
  const experienceSlug =
    typeof query.experience === "string" ? query.experience : null;
  const includeMenu = query.menu === "1" || query.menu === "true";
  const dataType = typeof query.data === "string" ? query.data : null; // 'reviews' | 'photos' | 'qa'
  const locale = typeof query.locale === "string" ? query.locale : undefined;

  // Parallelize site auth + location slug resolution — both only need siteId
  const [site, locationRow] = await Promise.all([
    db
      .prepare(
        `SELECT s.id, s.organization_id, s.default_currency, s.contact_email, s.contact_phone, s.brand_name,
                s.brand_description, COALESCE(ma.public_url, s.logo_url) AS logo_url
           FROM sites s
           LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
          WHERE s.id = ? AND s.status = 'active' AND s.onboarding_status = 'active'
          LIMIT 1`,
      )
      .bind(siteId)
      .first<{
        id: string;
        organization_id: string;
        default_currency: string | null;
        contact_email: string | null;
        contact_phone: string | null;
        brand_name: string | null;
        brand_description: string | null;
        logo_url: string | null;
      }>(),
    locationSlug
      ? db
          .prepare(
            `SELECT id FROM business_locations WHERE site_id = ? AND slug = ? AND status = 'active' LIMIT 1`,
          )
          .bind(siteId, locationSlug)
          .first<{ id: string }>()
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
    !page || page === "home" || page === "locations" || !!locationSlug;

  // Build batch — one subrequest to D1 for all inline queries
  const batchStmts: D1PreparedStatement[] = [];
  let idxLoc = -1,
    idxConfig = -1,
    idxLocale = -1,
    idxExpCount = -1;
  let idxReviews = -1,
    idxPosts = -1,
    idxLocReviews = -1;
  let idxFullReviews = -1,
    idxPhotos = -1,
    idxQa = -1;

  const push = (stmt: D1PreparedStatement) => {
    const i = batchStmts.length;
    batchStmts.push(stmt);
    return i;
  };

  // Always — locations with or without hero media JOINs
  idxLoc = push(
    needsLocationHeroMedia
      ? db.prepare(`
          SELECT bl.id, bl.slug, bl.title, bl.address, bl.phone, bl.email, bl.website_url, bl.maps_url,
                 bl.latitude, bl.longitude, bl.opening_hours, bl.rating, bl.review_count,
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
          ORDER BY bl.is_primary DESC, bl.title ASC
        `).bind(orgId, siteId)
      : db.prepare(`
          SELECT bl.id, bl.slug, bl.title, bl.address, bl.phone, bl.email, bl.website_url, bl.maps_url,
                 bl.latitude, bl.longitude, bl.opening_hours, bl.rating, bl.review_count,
                 bl.is_primary, bl.status, bl.city, bl.neighborhood,
                 bl.grab_url, bl.uber_eats_url, bl.foodpanda_url,
                 bl.description, bl.short_description, bl.last_synced_at,
                 NULL AS hero_image_public_url, NULL AS hero_video_public_url,
                 NULL AS thumbnail_url
          FROM business_locations bl
          WHERE bl.organization_id = ? AND bl.site_id = ? AND bl.status = 'active'
          ORDER BY bl.is_primary DESC, bl.title ASC
        `).bind(orgId, siteId),
  );

  idxConfig = push(
    db
      .prepare(
        `SELECT key, value FROM site_config WHERE organization_id = ? AND site_id = ?`,
      )
      .bind(orgId, siteId),
  );

  idxLocale = push(
    db
      .prepare(
        `SELECT locale, label, is_source, status
         FROM site_locales
         WHERE organization_id = ? AND site_id = ?
           AND (is_source = 1 OR status = 'published')
         ORDER BY is_source DESC, locale ASC`,
      )
      .bind(orgId, siteId),
  );

  idxExpCount = push(
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM experiences WHERE site_id = ? AND status = 'active'`,
      )
      .bind(siteId),
  );

  // Conditional
  if (needsGlobalReviews)
    idxReviews = push(
      db
        .prepare(
          `SELECT author_name AS author, rating, content, created_at AS date
           FROM reviews WHERE site_id = ? AND status = 'approved'
           ORDER BY created_at DESC LIMIT 10`,
        )
        .bind(siteId),
    );

  if (needsGlobalPosts)
    idxPosts = push(
      db
        .prepare(
          `SELECT p.id, p.title, p.body, p.published_at, ma.public_url, ma.kind
           FROM posts p
           LEFT JOIN media_assets ma ON p.image_asset_id = ma.id AND ma.status = 'active'
           WHERE p.site_id = ? AND p.status = 'published'
           ORDER BY p.published_at DESC LIMIT 6`,
        )
        .bind(siteId),
    );

  if (locationId)
    idxLocReviews = push(
      db
        .prepare(
          `SELECT id, author_name, rating, content, created_at
           FROM reviews WHERE location_id = ? AND site_id = ? AND status = 'approved'
           ORDER BY created_at DESC LIMIT 3`,
        )
        .bind(locationId, siteId),
    );

  if (locationId && dataType === "reviews")
    idxFullReviews = push(
      db
        .prepare(
          `SELECT id, author_name, reviewer_photo_url, rating, title, content,
                  owner_reply, owner_reply_at, photo_urls, source, created_at
           FROM reviews WHERE location_id = ? AND site_id = ? AND status = 'approved'
           ORDER BY created_at DESC LIMIT 50`,
        )
        .bind(locationId, siteId),
    );

  if (locationId && dataType === "photos")
    idxPhotos = push(
      db
        .prepare(
          `SELECT id, public_url, thumbnail_url, alt_text, category, created_at
           FROM media_assets
           WHERE site_id = ? AND location_id = ? AND kind = 'image' AND status = 'active'
           ORDER BY created_at DESC LIMIT 100`,
        )
        .bind(siteId, locationId),
    );

  if (dataType === "qa")
    idxQa = push(
      locationId
        ? db
            .prepare(
              `SELECT id, question, question_author, question_date,
                      answer, answer_author, answer_date, is_owner_answer, upvote_count
               FROM location_qa
               WHERE location_id = ? AND site_id = ? AND status = 'published'
               ORDER BY is_owner_answer DESC, upvote_count DESC, sort_order, created_at`,
            )
            .bind(locationId, siteId)
        : db
            .prepare(
              `SELECT id, question, question_author, question_date,
                      answer, answer_author, answer_date, is_owner_answer, upvote_count
               FROM location_qa
               WHERE site_id = ? AND status = 'published'
               ORDER BY is_owner_answer DESC, upvote_count DESC, sort_order, created_at`,
            )
            .bind(siteId),
    );

  // Fire batch + helper functions in one parallel round
  const [batchResults, contentRows, menuData, experiencesList, experienceDetail] =
    await Promise.all([
      db.batch(batchStmts),
      page
        ? getPublishedPageContentForLocale(db, orgId, siteId, page, { locale, locationId })
        : Promise.resolve([]),
      includeMenu
        ? getActiveMenu(db, orgId, siteId, locationId, locale)
        : Promise.resolve(null),
      (page === "experiences" && !experienceSlug) ||
      page === "home" ||
      page === "location"
        ? listExperiences(db, siteId, { activeOnly: true })
        : Promise.resolve([]),
      page === "experiences" && experienceSlug
        ? getExperienceBySlug(db, siteId, experienceSlug)
        : Promise.resolve(null),
    ]);

  // Extract batch results by tracked index
  const locRows = batchResults[idxLoc] as { results: Record<string, unknown>[] };
  const configRows = batchResults[idxConfig] as {
    results: { key: string; value: string }[];
  };
  const reviewRows =
    idxReviews >= 0
      ? (batchResults[idxReviews] as { results: Record<string, unknown>[] })
      : { results: [] as Record<string, unknown>[] };
  const postRows =
    idxPosts >= 0
      ? (batchResults[idxPosts] as { results: Record<string, unknown>[] })
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
          reviewSummary: {
            averageRating: primary.rating,
            totalReviewCount: primary.review_count,
          },
        }
      : null,
    reviews: reviewRows.results ?? [],
    media: [],
    posts: (postRows.results ?? []).map((p) => ({
      name: `posts/${p.id}`,
      summary: p.body,
      title: p.title ?? "",
      createTime: p.published_at ?? "",
      media: p.public_url ? [{ googleUrl: p.public_url, kind: p.kind }] : [],
    })),
    syncedAt: primary?.last_synced_at ?? null,
  };

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
  }));

  return jsonResponse({
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
          reviewsAggregate: locationForAggregate
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
    // Site locales + experiences — always included for header/nav
    locales: (localeRows?.results ?? []).map((l) => ({
      code: l.locale,
      label: l.label ?? l.locale,
      is_source: Boolean(l.is_source),
    })),
    hasExperiences: experienceCountVal > 0,
    experiencesList,
    experienceDetail,
  });
});
