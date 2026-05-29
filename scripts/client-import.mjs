#!/usr/bin/env node
/**
 * Deterministic client import pipeline for KrabiClaw.
 *
 * Always runs --dry-run first to produce a reviewable manifest before any DB writes.
 *
 * Usage:
 *   node scripts/client-import.mjs \
 *     --slug pottery-house-krabi \
 *     --vertical experience \
 *     --maps-url "https://www.google.com/maps/place/Pottery+House+Krabi/..." \
 *     --maps-url "https://www.google.com/maps/place/Beachfront+Pottery+Krabi/..." \
 *     --images ./new-client-Pottery-House-Krabi \
 *     --dry-run
 *
 * Environment variables:
 *   GOOGLE_MAPS_API_KEY  — required for Google Places lookup
 *
 * Outputs (in client-imports/<slug>/):
 *   client-manifest.json   — extracted business facts from Google Places
 *   media-manifest.json    — normalized image list ready for upload
 *   seed-preview.sql       — proposed INSERT statements (review before applying)
 *   missing-fields.json    — fields that could not be determined
 *   copy-scan.txt          — forbidden copy check against proposed seed
 */

import { parseArgs } from "node:util";
import { readdir, stat, mkdir, writeFile, readFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

// ── Args ─────────────────────────────────────────────────────────────────────

const { values: rawArgs } = parseArgs({
  options: {
    slug: { type: "string" },
    vertical: { type: "string", default: "restaurant" },
    "maps-url": { type: "string", multiple: true, default: [] },
    images: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
    approve: { type: "boolean", default: false },
    "allow-stock": { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
  },
  allowPositionals: true,
});

const SLUG = rawArgs.slug;

// Slug validation: only allow letters, digits, hyphens, underscores
const SLUG_SAFE_PATTERN = /^[a-zA-Z0-9_-]+$/;
if (!SLUG_SAFE_PATTERN.test(SLUG)) {
  console.error(
    "Error: --slug contains invalid characters. Only letters, digits, hyphens, and underscores are allowed.",
  );
  process.exit(1);
}
const VERTICAL = rawArgs.vertical;
const MAPS_URLS = rawArgs["maps-url"] ?? [];
const IMAGES_DIR = rawArgs.images;
const ALLOW_STOCK = rawArgs["allow-stock"] ?? false;
const REMOTE = rawArgs.remote ?? false;

// Validate VERTICAL against allowed set
const ALLOWED_VERTICALS = [
  "experience",
  "restaurant",
  "retail",
  "wellness",
  "service",
];
if (VERTICAL && !ALLOWED_VERTICALS.includes(VERTICAL)) {
  console.error(
    `Error: Invalid vertical "${VERTICAL}". Must be one of: ${ALLOWED_VERTICALS.join(", ")}`,
  );
  process.exit(1);
}

// Mode: --approve writes approved.json; --apply executes seed; default = dry-run
const MODE = rawArgs.approve ? "approve" : rawArgs.apply ? "apply" : "dry-run";

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!SLUG) {
  console.error("Error: --slug is required");
  console.error(
    "Usage: node scripts/client-import.mjs --slug <slug> [--dry-run | --approve | --apply] [--allow-stock] [--remote]",
  );
  process.exit(1);
}

const OUT_DIR = join(process.cwd(), "client-imports", SLUG);
await mkdir(OUT_DIR, { recursive: true });

function _uid(prefix = "") {
  return `${prefix}${createHash("sha256")
    .update(SLUG + Date.now() + Math.random())
    .digest("hex")
    .slice(0, 12)}`;
}

// ── Route parity check ────────────────────────────────────────────────────────

const CONTENT_TYPES = ["experiences", "posts", "menu", "locations", "reviews"];

function checkRouteParity() {
  const issues = [];

  for (const ct of CONTENT_TYPES) {
    const indexFile = join(process.cwd(), "pages", ct, "index.vue");
    const slugFile = join(process.cwd(), "pages", ct, "[slug].vue");
    const flatFile = join(process.cwd(), "pages", `${ct}.vue`);

    const hasIndex = existsSync(indexFile);
    const hasSlug = existsSync(slugFile);
    const hasFlat = existsSync(flatFile);

    // Conflict: flat file + slug file = broken nested routing (the experiences bug)
    if (hasFlat && hasSlug) {
      issues.push({
        type: "ERROR",
        message: `pages/${ct}.vue conflicts with pages/${ct}/[slug].vue — move to pages/${ct}/index.vue`,
      });
    }
    // Conflict: flat file + directory index = duplicate routes
    if (hasFlat && hasIndex) {
      issues.push({
        type: "ERROR",
        message: `pages/${ct}.vue and pages/${ct}/index.vue both exist — remove one`,
      });
    }
    // Warn: has slug routes but only flat index (no directory index alongside slug)
    if (hasFlat && !hasIndex && hasSlug) {
      issues.push({
        type: "WARN",
        message: `pages/${ct}.vue exists alongside pages/${ct}/[slug].vue — consider moving to pages/${ct}/index.vue`,
      });
    }
    // Warn: has directory index but no slug page for detail-capable content types
    if (hasIndex && !hasSlug && ["experiences", "menu", "posts"].includes(ct)) {
      issues.push({
        type: "WARN",
        message: `pages/${ct}/[slug].vue does not exist — detail pages will 404`,
      });
    }
  }

  return issues;
}

// ── Google Places API ─────────────────────────────────────────────────────────

function extractPlaceIdFromUrl(url) {
  // Pattern: !1sChIJ... in the URL data parameter
  const chijMatch = url.match(/!1s(ChIJ[^!&%]+)/);
  if (chijMatch) {
    try {
      return decodeURIComponent(chijMatch[1]);
    } catch {
      return chijMatch[1];
    }
  }
  return null;
}

function extractBusinessNameFromUrl(url) {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split("/");
    const placeIdx = pathParts.indexOf("place");
    if (placeIdx >= 0 && pathParts[placeIdx + 1]) {
      return decodeURIComponent(pathParts[placeIdx + 1].replace(/\+/g, " "));
    }
  } catch {
    // Ignore invalid URLs
  }
  return null;
}

async function resolveShortUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.url;
  } catch {
    clearTimeout(timeout);
    return url;
  }
}

async function fetchPlaceDetails(placeId) {
  if (!API_KEY) return null;

  const fields = [
    "place_id",
    "name",
    "formatted_address",
    "formatted_phone_number",
    "international_phone_number",
    "website",
    "rating",
    "user_ratings_total",
    "opening_hours",
    "photos",
    "reviews",
    "geometry",
    "url",
    "address_component",
    "vicinity",
  ].join(",");

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${API_KEY}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== "OK") {
      console.error(
        `  Google Places API error for ${placeId}: ${data.status} — ${data.error_message ?? ""}`,
      );
      return null;
    }
    return data.result;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      console.error(`  Google Places request timed out for ${placeId}`);
    }
    return null;
  }
}

async function findPlaceByText(query) {
  if (!API_KEY) return null;

  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address&key=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== "OK" || !data.candidates?.length) return null;

  return data.candidates[0].place_id;
}

async function resolvePlace(rawUrl) {
  let url = rawUrl;

  // Follow short URLs
  if (url.includes("maps.app.goo.gl") || url.includes("goo.gl")) {
    console.log(`  Resolving short URL: ${url}`);
    url = await resolveShortUrl(url);
    console.log(`  Expanded to: ${url}`);
  }

  const name = extractBusinessNameFromUrl(url);
  let placeId = extractPlaceIdFromUrl(url);

  if (!placeId && name && API_KEY) {
    console.log(`  No place ID in URL — searching by name: "${name}"`);
    placeId = await findPlaceByText(name);
  }

  if (!placeId) {
    return {
      source_url: rawUrl,
      name: name ?? "(unknown)",
      error: API_KEY
        ? "Could not resolve place ID"
        : "GOOGLE_MAPS_API_KEY not set — skipping Places API lookup",
    };
  }

  console.log(`  Place ID: ${placeId}`);
  const details = await fetchPlaceDetails(placeId);

  if (!details) {
    return {
      source_url: rawUrl,
      place_id: placeId,
      name: name ?? "(unknown)",
      error: "Places API returned no details",
    };
  }

  return {
    source_url: rawUrl,
    place_id: details.place_id,
    name: details.name,
    formatted_address: details.formatted_address,
    phone: details.formatted_phone_number ?? null,
    international_phone: details.international_phone_number ?? null,
    website: details.website ?? null,
    rating: details.rating ?? null,
    user_ratings_total: details.user_ratings_total ?? null,
    lat: details.geometry?.location?.lat ?? null,
    lng: details.geometry?.location?.lng ?? null,
    opening_hours: details.opening_hours ?? null,
    photos: (details.photos ?? []).slice(0, 10).map((p) => ({
      reference: p.photo_reference,
      width: p.width,
      height: p.height,
      attributions: p.html_attributions,
    })),
    reviews: (details.reviews ?? []).slice(0, 10).map((r) => ({
      author: r.author_name,
      rating: r.rating,
      text: r.text,
      time: r.time,
    })),
    maps_url: details.url ?? rawUrl,
    _raw: details,
  };
}

// ── Image scanning ────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function normalizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.\-_]/g, "")
    .replace(/-+/g, "-");
}

async function scanImages(dir) {
  if (!dir || !existsSync(dir)) {
    return { error: `Image directory not found: ${dir}`, files: [] };
  }

  // Resolve and normalize path to prevent traversal attacks
  const resolvedPath = join(process.cwd(), dir);
  const normalizedPath = join(resolvedPath);

  // Reject absolute paths or paths outside cwd
  if (
    dir.startsWith("/") ||
    dir.startsWith("..") ||
    !normalizedPath.startsWith(process.cwd())
  ) {
    return { error: `Invalid image directory path: ${dir}`, files: [] };
  }

  const dirStat = await stat(resolvedPath);
  const entries = await readdir(resolvedPath);
  const files = [];

  const brandLabel = SLUG.replace(/-/g, " ").replace(/\b\w/g, (l) =>
    l.toUpperCase(),
  );

  for (const entry of entries) {
    const ext = extname(entry).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;

    const fullPath = join(resolvedPath, entry);
    const info = await stat(fullPath);

    // Reject symlinks
    if (info.isSymbolicLink()) {
      continue;
    }
    const normalName = normalizeFilename(basename(entry, ext)) + ext;

    const contents = await readFile(fullPath);
    const hash = createHash("sha256").update(contents).digest("hex");

    const assignedTo = files.length === 0 ? "hero" : `gallery-${files.length}`;

    files.push({
      source_file: fullPath,
      original_name: entry,
      normalized_name: normalName,
      public_url: `/images/${SLUG}/${normalName}`,
      assigned_to: assignedTo,
      alt_text: brandLabel,
      hash: `sha256:${hash}`,
      size_bytes: info.size,
      uploaded_at: null,
    });
  }

  return {
    directory: dir,
    dir_mtime: dirStat.mtime.toISOString(),
    total: files.length,
    files,
  };
}

// ── Missing fields detection ──────────────────────────────────────────────────

function detectMissingFields(places) {
  const missing = [];

  for (const place of places) {
    if (place.error) {
      missing.push({
        location: place.name,
        field: "place_data",
        issue: place.error,
      });
      continue;
    }
    if (!place.phone && !place.international_phone)
      missing.push({ location: place.name, field: "phone" });
    if (!place.opening_hours)
      missing.push({ location: place.name, field: "opening_hours" });
    if (!place.lat || !place.lng)
      missing.push({ location: place.name, field: "coordinates" });
    if (!place.formatted_address)
      missing.push({ location: place.name, field: "address" });
    if (!place.reviews?.length)
      missing.push({
        location: place.name,
        field: "reviews",
        issue: "No reviews returned from API",
      });
    if (!place.photos?.length)
      missing.push({
        location: place.name,
        field: "photos",
        issue: "No photos returned from API (may need manual upload)",
      });
  }

  return missing;
}

// ── Forbidden copy scan ───────────────────────────────────────────────────────

const FORBIDDEN_BY_VERTICAL = {
  experience: [
    "restaurant",
    "kitchen",
    "dining",
    "chef",
    "menu",
    "table reservation",
    "catering",
    "dine",
    "Come dine",
    "From the kitchen",
    "Reserve a table",
    "one kitchen philosophy",
    "Dietary needs.*preferred seating",
  ],
  restaurant: [],
  retail: [],
  wellness: [],
  service: [],
};

function scanForbiddenCopy(sql, vertical) {
  const patterns = FORBIDDEN_BY_VERTICAL[vertical] ?? [];
  const hits = [];

  for (const pattern of patterns) {
    const re = new RegExp(pattern, "i");
    const lines = sql.split("\n");
    lines.forEach((line, i) => {
      if (re.test(line) && !line.trim().startsWith("--")) {
        hits.push({ pattern, line: i + 1, text: line.trim().slice(0, 100) });
      }
    });
  }

  return hits;
}

// ── Seed SQL generation ───────────────────────────────────────────────────────

function generateSeedSql(places, mediaManifest) {
  const orgId = `org-${SLUG}`;
  const siteId = `site-${SLUG}`;
  const now = new Date().toISOString();

  const primary = places[0];
  const _secondary = places.slice(1);

  const brandName = primary?.name ?? SLUG;

  const locationInserts = places
    .map((place, idx) => {
      const locId = `loc-${SLUG}-${idx}`;
      const isPrimary = idx === 0 ? 1 : 0;
      const phone = place.international_phone ?? place.phone ?? "NULL";
      const address = place.formatted_address
        ? `'${place.formatted_address.replace(/'/g, "''")}'`
        : "NULL";
      const mapsUrl = place.maps_url
        ? `'${place.maps_url.replace(/'/g, "''")}'`
        : "NULL";
      const lat = place.lat ?? "NULL";
      const lng = place.lng ?? "NULL";
      const hours = place.opening_hours
        ? `'${JSON.stringify(place.opening_hours).replace(/'/g, "''")}'`
        : "NULL";
      const rating = place.rating ?? "NULL";
      const ratingCount = place.user_ratings_total ?? "NULL";
      const slug = (place.name ?? "location")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      return `-- Location: ${place.name}
INSERT INTO business_locations (
  id, site_id, organization_id, slug, title, address, phone,
  maps_url, latitude, longitude, opening_hours,
  rating, review_count, is_primary, status
) VALUES (
  '${locId}', '${siteId}', '${orgId}',
  '${slug}', '${(place.name ?? "").replace(/'/g, "''")}',
  ${address}, ${phone === "NULL" ? "NULL" : `'${phone}'`},
  ${mapsUrl}, ${lat}, ${lng}, ${hours},
  ${rating}, ${ratingCount}, ${isPrimary}, 'active'
) ON CONFLICT(id) DO UPDATE SET
  title = excluded.title, address = excluded.address,
  phone = excluded.phone, maps_url = excluded.maps_url,
  latitude = excluded.latitude, longitude = excluded.longitude,
  opening_hours = excluded.opening_hours,
  rating = excluded.rating, review_count = excluded.review_count,
  updated_at = CURRENT_TIMESTAMP;`;
    })
    .join("\n\n");

  const heroAssets = mediaManifest.files
    .slice(0, 3)
    .map((f, i) => {
      const assetId = `asset-${SLUG}-${i}`;
      const ext = (f.original_name ? extname(f.original_name) : extname(f.normalized_name ?? "")).toLowerCase() || ".jpg";
      const provider = f.cloudflare_image_id ? "cloudflare_images" : "cloudflare_r2";
      const cfId = f.cloudflare_image_id ? `'${f.cloudflare_image_id}'` : "NULL";
      const thumb = f.thumbnail_url ? `'${f.thumbnail_url.replace(/'/g, "''")}'` : "NULL";
      const publicUrl = f.cloudflare_image_id
        ? f.public_url
        : `https://media.krabiclaw.com/sites/${siteId}/media/${assetId}${ext}`;
      return `INSERT INTO media_assets (id, site_id, organization_id, cloudflare_image_id, public_url, thumbnail_url, alt_text, kind, provider, source, status)
VALUES ('${assetId}', '${siteId}', '${orgId}', ${cfId}, '${publicUrl}', ${thumb}, '${brandName}', 'image', '${provider}', 'uploaded', 'active')
ON CONFLICT(id) DO UPDATE SET
  cloudflare_image_id = excluded.cloudflare_image_id,
  public_url = excluded.public_url,
  thumbnail_url = excluded.thumbnail_url,
  alt_text = excluded.alt_text,
  updated_at = CURRENT_TIMESTAMP;`;
    })
    .join("\n");

  return `-- ============================================================
-- Seed: ${SLUG}  (vertical: ${VERTICAL})
-- Generated: ${now}
-- REVIEW CAREFULLY before applying — DO NOT run without checking
-- ============================================================

-- Organization
INSERT INTO organization (id, name, slug)
VALUES ('${orgId}', '${brandName.replace(/'/g, "''")}', '${SLUG}')
ON CONFLICT(id) DO UPDATE SET name = excluded.name;

-- Site
INSERT INTO sites (
  id, organization_id, theme_id, theme, slug, subdomain,
  brand_name, brand_description,
  status, plan, onboarding_status, url_structure,
  default_currency, vertical, content_source, media_source
) VALUES (
  '${siteId}', '${orgId}', 'saya-theme-v1', 'saya', '${SLUG}', '${SLUG}',
  '${brandName.replace(/'/g, "''")}', NULL,
  'active', 'free', 'active', 'location_subdirectories',
  'THB', '${VERTICAL}', 'google_maps', 'client_photos'
) ON CONFLICT(id) DO UPDATE SET
  brand_name = excluded.brand_name,
  vertical = excluded.vertical,
  updated_at = CURRENT_TIMESTAMP;

-- Domains
INSERT INTO site_domains (id, organization_id, site_id, domain, type, role, status, dns_status)
VALUES
  ('domain-${SLUG}-local', '${orgId}', '${siteId}', '${SLUG}.localhost', 'subdomain', 'secondary', 'active', 'valid'),
  ('domain-${SLUG}-prod', '${orgId}', '${siteId}', '${SLUG}.krabiclaw.com', 'subdomain', 'canonical', 'active', 'valid')
ON CONFLICT(id) DO NOTHING;

-- Locales
INSERT INTO site_locales (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled)
VALUES
  ('locale::${orgId}::${siteId}::en', '${orgId}', '${siteId}', 'en', 'English', 1, 'published', 1),
  ('locale::${orgId}::${siteId}::th', '${orgId}', '${siteId}', 'th', 'ไทย', 0, 'published', 1)
ON CONFLICT(id) DO NOTHING;

-- Locations
${locationInserts}

-- Media assets (hero images — map to actual uploaded paths before applying)
${heroAssets}
`;
}

// ── Route manifest ────────────────────────────────────────────────────────────

function generateRouteManifest(places) {
  const locations = places
    .filter((p) => !p.error)
    .map((p) => {
      const slug = (p.name ?? "location")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return `/locations/${slug}`;
    });

  const manifest = {
    generated_at: new Date().toISOString(),
    slug: SLUG,
    vertical: VERTICAL,
    locations,
    // Experience slugs come from the experiences table; verify via bootstrap post-seed.
    experiences: [],
  };

  if (VERTICAL === "experience") {
    manifest._note =
      "Run client:verify --site-id to discover experience slugs via bootstrap API";
  }

  return manifest;
}

// ── Cloudflare Images upload ──────────────────────────────────────────────────

async function uploadImagesToCloudflare(files) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_IMAGES_API_TOKEN;
  const variantBase = process.env.CLOUDFLARE_IMAGES_VARIANT_BASE;

  if (!accountId || !token || !variantBase) return false;

  const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
  let uploaded = 0;

  for (const file of files) {
    if (file.cloudflare_image_id) {
      console.log(`  ✓ Already uploaded: ${file.original_name} (${file.cloudflare_image_id})`);
      continue;
    }
    if (!file.source_file || !existsSync(file.source_file)) {
      console.log(`  ⚠ Source file not found, skipping: ${file.original_name}`);
      continue;
    }

    const ext = extname(file.original_name ?? "").toLowerCase();
    const mime = MIME[ext] ?? "image/jpeg";
    const bytes = await readFile(file.source_file);
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), file.normalized_name);

    const controller = new AbortController();
    const uploadTimeout = setTimeout(() => controller.abort(), 30000);
    let res;
    try {
      res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form, signal: controller.signal }
      );
    } catch (err) {
      clearTimeout(uploadTimeout);
      if (err.name === "AbortError") {
        throw new Error(`CF Images upload timed out: ${file.original_name}`);
      }
      throw err;
    }
    clearTimeout(uploadTimeout);

    if (!res.ok) {
      const body = await res.text();
      console.error(`  ✗ Upload failed for ${file.original_name}: ${res.status} ${body}`);
      throw new Error(`CF Images upload failed: ${file.original_name}`);
    }

    const data = await res.json();
    const imageId = data?.result?.id;
    if (!imageId) throw new Error(`CF Images malformed response for ${file.original_name}: ${JSON.stringify(data)}`);

    file.cloudflare_image_id = imageId;
    file.public_url = `${variantBase}/${imageId}/public`;
    file.thumbnail_url = `${variantBase}/${imageId}/thumbnail`;
    file.uploaded_at = new Date().toISOString();
    uploaded++;
    console.log(`  ✓ ${file.original_name} → ${imageId}`);
  }

  return uploaded;
}

// ── D1 row-count query (best-effort, for overwrite visibility) ────────────────

function queryD1Count(table, siteId, remote) {
  const flag = remote ? "--remote" : "--local";
  try {
    const result = spawnSync(
      "yarn",
      [
        "wrangler",
        "d1",
        "execute",
        "DB",
        flag,
        "--command",
        `SELECT COUNT(*) as n FROM ${table} WHERE site_id = '${siteId}'`,
        "--json",
      ],
      { encoding: "utf8", cwd: process.cwd() },
    );
    if (result.status !== 0) return null;
    const jsonMatch = (result.stdout + (result.stderr ?? "")).match(
      /\[[\s\S]*?\]/,
    );
    if (!jsonMatch) return null;
    const arr = JSON.parse(jsonMatch[0]);
    const n = arr[0]?.results?.[0]?.n;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(
  `\n┌─ KrabiClaw Client Import ─────────────────────────────────────`,
);
console.log(`│  Slug:     ${SLUG}`);
console.log(`│  Vertical: ${VERTICAL}`);
console.log(`│  Mode:     ${MODE}${REMOTE ? " (remote DB)" : " (local DB)"}`);
console.log(
  `└──────────────────────────────────────────────────────────────\n`,
);

// ── Approve mode ─────────────────────────────────────────────────────────────

if (MODE === "approve") {
  const manifestPath = join(OUT_DIR, "client-manifest.json");
  const seedPath = join(OUT_DIR, "seed-preview.sql");

  if (!existsSync(manifestPath) || !existsSync(seedPath)) {
    console.error(
      "Error: No dry-run output found. Run --dry-run first to generate manifests.",
    );
    process.exit(1);
  }

  const manifestContent = await readFile(manifestPath, "utf8");
  const seedContent = await readFile(seedPath, "utf8");
  const hash = createHash("sha256")
    .update(manifestContent)
    .update(seedContent)
    .digest("hex");

  // Load media manifest to capture dir mtime for stale-guard in apply
  let mediaMeta = null;
  const mediaManifestPath = join(OUT_DIR, "media-manifest.json");
  if (existsSync(mediaManifestPath)) {
    try {
      const mm = JSON.parse(await readFile(mediaManifestPath, "utf8"));
      mediaMeta = {
        directory: mm.directory ?? null,
        dir_mtime: mm.dir_mtime ?? null,
        count: mm.files?.length ?? 0,
      };
    } catch {
      // Ignore parse errors
    }
  }

  const approved = {
    approved: true,
    approved_by: process.env.USER ?? "unknown",
    approved_at: new Date().toISOString(),
    manifest_hash: hash,
    slug: SLUG,
    vertical: VERTICAL,
    api_key_available: !!process.env.GOOGLE_MAPS_API_KEY,
    media_dir: mediaMeta?.directory ?? null,
    media_dir_mtime: mediaMeta?.dir_mtime ?? null,
    media_count: mediaMeta?.count ?? 0,
  };

  const approvedPath = join(OUT_DIR, "approved.json");
  await writeFile(approvedPath, JSON.stringify(approved, null, 2), "utf8");

  console.log(`✓ Approval recorded: ${approvedPath}`);
  console.log(`  manifest_hash: ${hash}`);
  console.log(`\nNext: yarn client:import --slug ${SLUG} --apply`);
  process.exit(0);
}

// ── Apply mode ────────────────────────────────────────────────────────────────

if (MODE === "apply") {
  const approvedPath = join(OUT_DIR, "approved.json");
  const seedPath = join(OUT_DIR, "seed-preview.sql");
  const manifestPath = join(OUT_DIR, "client-manifest.json");

  // Gate 1: approved.json must exist
  if (!existsSync(approvedPath)) {
    console.error(
      "Error: No approved.json found. Run --approve first after reviewing the dry-run output.",
    );
    process.exit(1);
  }

  const approvedRaw = JSON.parse(await readFile(approvedPath, "utf8"));
  if (!approvedRaw.approved) {
    console.error(
      "Error: approved.json has approved: false — set it to true before applying.",
    );
    process.exit(1);
  }

  // Gate 2: hash verification
  if (!existsSync(manifestPath) || !existsSync(seedPath)) {
    console.error(
      "Error: Manifest or seed files missing. Re-run --dry-run and --approve.",
    );
    process.exit(1);
  }

  const manifestContent = await readFile(manifestPath, "utf8");
  const seedContent = await readFile(seedPath, "utf8");
  const currentHash = createHash("sha256")
    .update(manifestContent)
    .update(seedContent)
    .digest("hex");

  if (currentHash !== approvedRaw.manifest_hash) {
    console.error(
      "Error: Manifest hash mismatch — the dry-run output has changed since approval.",
    );
    console.error(
      "  Re-run --dry-run and --approve to refresh the approval for the current output.",
    );
    process.exit(1);
  }

  // Gate 3: stale approval timestamp
  const approvedFileStat = await stat(approvedPath);
  const manifestFileStat = await stat(manifestPath);
  const seedFileStat = await stat(seedPath);
  const latestManifestMs = Math.max(
    manifestFileStat.mtimeMs,
    seedFileStat.mtimeMs,
  );

  if (latestManifestMs > approvedFileStat.mtimeMs) {
    const newerFile =
      manifestFileStat.mtimeMs > seedFileStat.mtimeMs
        ? "client-manifest.json"
        : "seed-preview.sql";
    console.error(
      `Error: ${newerFile} is newer than approved.json — manifests changed after approval.`,
    );
    console.error("  Re-run --dry-run and --approve.");
    process.exit(1);
  }

  // Gate 4: API key availability changed between dry-run and apply
  if ("api_key_available" in approvedRaw) {
    const keyNow = !!process.env.GOOGLE_MAPS_API_KEY;
    if (keyNow !== approvedRaw.api_key_available) {
      const was = approvedRaw.api_key_available ? "available" : "unavailable";
      const now = keyNow ? "available" : "unavailable";
      console.error(
        `Error: GOOGLE_MAPS_API_KEY was ${was} during dry-run but is ${now} now.`,
      );
      console.error(
        "  Re-run --dry-run and --approve to regenerate with current API access.",
      );
      process.exit(1);
    }
  }

  // Gate 5: media folder changed after approval
  if (approvedRaw.media_dir && existsSync(approvedRaw.media_dir)) {
    const currentDirStat = await stat(approvedRaw.media_dir);
    if (currentDirStat.mtime.toISOString() !== approvedRaw.media_dir_mtime) {
      console.error(
        `Error: Image directory was modified after approval: ${approvedRaw.media_dir}`,
      );
      console.error(
        "  Re-run --dry-run and --approve if image changes are intentional.",
      );
      process.exit(1);
    }
  }

  // Gate 6: approval invalidated by override
  if (approvedRaw.invalidated) {
    console.error(
      `Error: Approval was invalidated — ${approvedRaw.invalidated_reason ?? "overrides changed after approval"}`,
    );
    console.error(
      "  Re-run --approve after reviewing the regenerated manifests.",
    );
    process.exit(1);
  }

  // Gate 7: stock media guard
  const mediaManifestPath = join(OUT_DIR, "media-manifest.json");
  if (existsSync(mediaManifestPath)) {
    const media = JSON.parse(await readFile(mediaManifestPath, "utf8"));
    if (!media.files?.length && !ALLOW_STOCK) {
      console.error("Error: No client images found in media manifest.");
      console.error(
        "  Add --allow-stock to proceed with stock/placeholder images, or provide an --images directory.",
      );
      process.exit(1);
    }
    if (!media.files?.length && ALLOW_STOCK) {
      console.log(
        "⚠ Proceeding with no client images (--allow-stock set). Update media before launch.",
      );
    }
  }

  console.log(`✓ All gates passed (hash: ${currentHash.slice(0, 12)}…)`);
  console.log(
    `  Approved by: ${approvedRaw.approved_by} at ${approvedRaw.approved_at}`,
  );

  // ── CF Images upload ───────────────────────────────────────────────────────
  const mediaManifestApplyPath = join(OUT_DIR, "media-manifest.json");
  let cfImagesPatchPath = null;

  if (existsSync(mediaManifestApplyPath)) {
    const mediaApply = JSON.parse(await readFile(mediaManifestApplyPath, "utf8"));
    const pending = (mediaApply.files ?? []).filter((f) => !f.cloudflare_image_id);

    if (pending.length > 0) {
      const hasCreds =
        process.env.CF_ACCOUNT_ID &&
        process.env.CLOUDFLARE_IMAGES_API_TOKEN &&
        process.env.CLOUDFLARE_IMAGES_VARIANT_BASE;

      if (hasCreds) {
        console.log(`\n→ Uploading ${pending.length} image(s) to Cloudflare Images...`);
        const uploaded = await uploadImagesToCloudflare(mediaApply.files);
        if (uploaded > 0) {
          await writeFile(mediaManifestApplyPath, JSON.stringify(mediaApply, null, 2), "utf8");

          // Generate UPDATE patch SQL for the rows the seed is about to create
          const siteIdForPatch = `site-${SLUG}`;
          const variantBase = process.env.CLOUDFLARE_IMAGES_VARIANT_BASE;
          const patchStatements = mediaApply.files
            .slice(0, 3)
            .map((f, i) => {
              if (!f.cloudflare_image_id) return null;
              const assetId = `asset-${SLUG}-${i}`;
              return `UPDATE media_assets SET
  cloudflare_image_id = '${f.cloudflare_image_id}',
  public_url = '${variantBase}/${f.cloudflare_image_id}/public',
  thumbnail_url = '${variantBase}/${f.cloudflare_image_id}/thumbnail',
  provider = 'cloudflare_images'
WHERE id = '${assetId}' AND site_id = '${siteIdForPatch}';`;
            })
            .filter(Boolean)
            .join("\n");

          if (patchStatements) {
            cfImagesPatchPath = join(OUT_DIR, "seed-cf-images.sql");
            await writeFile(
              cfImagesPatchPath,
              `-- CF Images patch — applied after seed-preview.sql\n${patchStatements}\n`,
              "utf8",
            );
            console.log(`  ✓ Patch SQL written: ${cfImagesPatchPath}`);
          }
        }
      } else {
        console.log(
          "\n⚠ CF Images credentials not set — images seeded with placeholder R2 URLs.",
        );
        console.log(
          "  Set CF_ACCOUNT_ID, CLOUDFLARE_IMAGES_API_TOKEN, CLOUDFLARE_IMAGES_VARIANT_BASE to upload automatically.",
        );
      }
    }
  }

  // Overwrite visibility — query row counts before apply
  const siteId = `site-${SLUG}`;
  const TRACKED = [
    "business_locations",
    "reviews",
    "location_qa",
    "media_assets",
    "experiences",
  ];
  const before = {};
  console.log("\n→ Querying current row counts...");
  for (const table of TRACKED) {
    before[table] = queryD1Count(table, siteId, REMOTE) ?? "?";
  }

  console.log(
    `\n→ Executing seed SQL against ${REMOTE ? "remote" : "local"} D1...`,
  );
  const d1Flag = REMOTE ? "--remote" : "--local";
  try {
    spawnSync(
      "yarn",
      ["wrangler", "d1", "execute", "DB", d1Flag, "--file", seedPath],
      { stdio: "inherit", cwd: process.cwd() },
    );
  } catch {
    console.error("\n✗ Seed execution failed — check wrangler output above.");
    process.exit(1);
  }

  // Apply CF Images patch if one was generated
  if (cfImagesPatchPath && existsSync(cfImagesPatchPath)) {
    console.log("\n→ Applying CF Images URL patch...");
    try {
      spawnSync(
        "yarn",
        ["wrangler", "d1", "execute", "DB", d1Flag, "--file", cfImagesPatchPath],
        { stdio: "inherit", cwd: process.cwd() },
      );
      console.log("  ✓ CF Images URLs applied");
    } catch {
      console.error("  ✗ CF Images patch failed — run manually: wrangler d1 execute DB --file " + cfImagesPatchPath);
    }
  }

  // Overwrite visibility — query after
  const after = {};
  for (const table of TRACKED) {
    after[table] = queryD1Count(table, siteId, REMOTE) ?? "?";
  }

  // Print diff table
  const anyCountsAvailable = TRACKED.some((t) => typeof before[t] === "number");
  if (anyCountsAvailable) {
    console.log("\n  Table                  before   after   delta");
    console.log("  " + "─".repeat(48));
    for (const table of TRACKED) {
      const b = before[table];
      const a = after[table];
      const delta =
        typeof b === "number" && typeof a === "number"
          ? a - b > 0
            ? `+${a - b}`
            : String(a - b)
          : "?";
      console.log(
        `  ${table.padEnd(22)} ${String(b).padStart(6)}   ${String(a).padStart(5)}   ${String(delta).padStart(5)}`,
      );
    }
  }

  console.log("\n✓ Seed applied.");
  console.log(
    `\nNext: yarn client:verify --url ${REMOTE ? `https://${SLUG}.krabiclaw.com` : `http://localhost:3000`} --vertical ${VERTICAL} --site-id ${siteId} --slug ${SLUG}`,
  );
  process.exit(0);
}

// ── Step 1: Route parity ─────────────────────────────────────────────────────

console.log("→ Checking route parity...");
const parityIssues = checkRouteParity();
if (parityIssues.length === 0) {
  console.log("  ✓ All route files look correct");
} else {
  for (const issue of parityIssues) {
    const icon = issue.type === "ERROR" ? "✗" : "⚠";
    console.log(`  ${icon} [${issue.type}] ${issue.message}`);
  }
}

// ── Step 2: Google Places ────────────────────────────────────────────────────

console.log("\n→ Resolving Google Places data...");

if (!API_KEY) {
  console.log(
    "  ⚠ GOOGLE_MAPS_API_KEY not set — Places API calls will be skipped",
  );
}

const places = [];
for (const url of MAPS_URLS) {
  console.log(`  Resolving: ${url.slice(0, 80)}...`);
  const place = await resolvePlace(url);
  places.push(place);
  if (place.name && !place.error) {
    console.log(`  ✓ ${place.name} (${place.phone ?? "no phone"})`);
  } else {
    console.log(`  ⚠ ${place.error ?? "Unknown error"}`);
  }
}

if (places.length === 0) {
  console.log("  ⚠ No Maps URLs provided — location data will be empty");
}

// ── Step 3: Image scan ───────────────────────────────────────────────────────

console.log("\n→ Scanning images...");
const mediaManifest = await scanImages(IMAGES_DIR);

if (mediaManifest.error) {
  console.log(`  ⚠ ${mediaManifest.error}`);
  if (!ALLOW_STOCK) {
    console.log(
      "  ⚠ No client images found. Add --allow-stock to allow stock/placeholder images,",
    );
    console.log(
      "    or pass --images <dir> to provide client photos. --apply will refuse without one.",
    );
  } else {
    console.log(
      "  ⚠ --allow-stock set — proceeding without client images. Remember to update before launch.",
    );
  }
} else {
  console.log(
    `  ✓ Found ${mediaManifest.total} images in ${mediaManifest.directory}`,
  );
  for (const f of mediaManifest.files.slice(0, 5)) {
    console.log(`    ${f.original_name} → ${f.normalized_name}`);
  }
  if (mediaManifest.files.length > 5) {
    console.log(`    ... and ${mediaManifest.files.length - 5} more`);
  }
}

// ── Step 3b: Apply overrides ─────────────────────────────────────────────────

const overridesPath = join(OUT_DIR, "overrides.json");
if (existsSync(overridesPath)) {
  try {
    const raw = JSON.parse(await readFile(overridesPath, "utf8"));
    const overrides = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, v.value]),
    );
    const keys = Object.keys(overrides);
    if (keys.length > 0) {
      console.log(
        `\n→ Applying ${keys.length} override(s) from overrides.json...`,
      );
      if (places[0]) {
        if (overrides.phone) {
          places[0].phone = overrides.phone;
          places[0].international_phone = overrides.phone;
        }
        if (overrides.address) {
          places[0].formatted_address = overrides.address;
        }
        if (overrides.title) {
          places[0].name = overrides.title;
        }
        if (overrides.website) {
          places[0].website = overrides.website;
        }
        if (overrides.lat) {
          const lat = parseFloat(overrides.lat);
          if (Number.isFinite(lat)) places[0].lat = lat;
        }
        if (overrides.lng) {
          const lng = parseFloat(overrides.lng);
          if (Number.isFinite(lng)) places[0].lng = lng;
        }
      }
      for (const k of keys)
        console.log(`  ${k} = ${JSON.stringify(overrides[k])}`);
    }
  } catch {
    console.log("  ⚠ Could not parse overrides.json — skipping");
  }
}

// ── Step 4: Missing fields ───────────────────────────────────────────────────

console.log("\n→ Detecting missing fields...");
const missing = detectMissingFields(places);
if (missing.length === 0) {
  console.log("  ✓ No missing required fields");
} else {
  for (const m of missing) {
    console.log(
      `  ⚠ ${m.location}: missing ${m.field}${m.issue ? ` (${m.issue})` : ""}`,
    );
  }
}

// ── Step 5: Generate seed SQL ────────────────────────────────────────────────

console.log("\n→ Generating seed preview...");
const seedSql = generateSeedSql(
  places,
  mediaManifest.files ? mediaManifest : { files: [] },
);

// ── Step 5b: Generated-copy inventory ────────────────────────────────────────

console.log("\n→ Building generated-copy inventory...");

function buildGeneratedCopyInventory(places, mediaManifest) {
  const inventory = [];
  const _now = new Date().toISOString();

  // Location slugs — computed from business name, not from Google Places directly
  for (const place of places.filter((p) => !p.error)) {
    const slug = (place.name ?? "location")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    inventory.push({
      table: "business_locations",
      field: "slug",
      value: slug,
      provenance: "generated",
      source_inputs: ["place.name"],
      note: "Slugified from business name — verify no collision with other sites",
    });

    // Description is null unless provided
    inventory.push({
      table: "business_locations",
      field: "description",
      value: place.description ?? null,
      provenance: place.description ? "google_maps" : "missing",
      source_inputs: place.description ? ["google_maps"] : [],
      note: place.description
        ? null
        : "No description from Places API — fill before launch",
    });
  }

  // Site brand_description — always null from this pipeline
  inventory.push({
    table: "sites",
    field: "brand_description",
    value: null,
    provenance: "missing",
    source_inputs: [],
    note: "Not available from Places API — write manually or via ChowBot",
  });

  // Media alt_text — generated from slug, not from client
  for (const file of mediaManifest.files ?? []) {
    inventory.push({
      table: "media_assets",
      field: "alt_text",
      value: file.alt_text,
      provenance: "generated",
      source_inputs: ["slug"],
      note: `Generated for ${file.assigned_to} — update with client-supplied caption if available`,
    });
  }

  // Review text — sourced from Google Places if present
  for (const place of places.filter((p) => !p.error && p.reviews?.length)) {
    for (const review of place.reviews) {
      inventory.push({
        table: "reviews",
        field: "content",
        value:
          review.text?.slice(0, 80) + (review.text?.length > 80 ? "…" : ""),
        provenance: "google_maps",
        source_inputs: ["google_maps_review"],
        note: `Rating ${review.rating}/5 by ${review.author}`,
      });
    }
  }

  return inventory;
}

const generatedCopyInventory = buildGeneratedCopyInventory(
  places,
  mediaManifest.files ? mediaManifest : { files: [] },
);

const generatedCount = generatedCopyInventory.filter(
  (i) => i.provenance === "generated",
).length;
const missingCount = generatedCopyInventory.filter(
  (i) => i.provenance === "missing",
).length;
console.log(
  `  ✓ ${generatedCopyInventory.length} fields catalogued (${generatedCount} generated, ${missingCount} missing)`,
);

// ── Step 6: Forbidden copy scan ──────────────────────────────────────────────

console.log("\n→ Scanning for forbidden copy...");
const copyHits = scanForbiddenCopy(seedSql, VERTICAL);
let copyReport = "";

if (copyHits.length === 0) {
  console.log("  ✓ No forbidden copy found in proposed seed");
  copyReport = "PASS — no forbidden copy detected\n";
} else {
  for (const hit of copyHits) {
    console.log(
      `  ✗ Line ${hit.line}: pattern "${hit.pattern}" matched: ${hit.text}`,
    );
  }
  copyReport =
    `FAIL — ${copyHits.length} forbidden copy hit(s)\n\n` +
    copyHits.map((h) => `Line ${h.line} [${h.pattern}]: ${h.text}`).join("\n") +
    "\n";
}

// ── Step 7: Write manifests ───────────────────────────────────────────────────

console.log("\n→ Writing manifests...");

const clientManifest = {
  generated_at: new Date().toISOString(),
  slug: SLUG,
  vertical: VERTICAL,
  content_source: "google_maps",
  media_source: "client_photos",
  primary_location: places[0] ?? null,
  secondary_locations: places.slice(1),
  forbidden_copy_domains: FORBIDDEN_BY_VERTICAL[VERTICAL] ?? [],
};

// Remove _raw from manifest (too verbose — stored separately in google_place_snapshots)
const manifestForFile = JSON.parse(
  JSON.stringify(clientManifest, (k, v) => (k === "_raw" ? undefined : v)),
);

const routeManifest = generateRouteManifest(places);

const files = {
  "client-manifest.json": JSON.stringify(manifestForFile, null, 2),
  "media-manifest.json": JSON.stringify(mediaManifest, null, 2),
  "route-manifest.json": JSON.stringify(routeManifest, null, 2),
  "generated-copy.json": JSON.stringify(generatedCopyInventory, null, 2),
  "seed-preview.sql": seedSql,
  "missing-fields.json": JSON.stringify(missing, null, 2),
  "copy-scan.txt": copyReport,
  "route-parity.json": JSON.stringify(parityIssues, null, 2),
};

for (const [name, content] of Object.entries(files)) {
  const path = join(OUT_DIR, name);
  await writeFile(path, content, "utf8");
  console.log(`  ✓ ${path}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(
  `\n┌─ Summary ──────────────────────────────────────────────────────`,
);
console.log(
  `│  Places resolved:  ${places.filter((p) => !p.error).length} / ${places.length}`,
);
console.log(`│  Images found:     ${mediaManifest.files?.length ?? 0}`);
console.log(`│  Missing fields:   ${missing.length}`);
console.log(`│  Copy violations:  ${copyHits.length}`);
console.log(`│  Route issues:     ${parityIssues.length}`);
console.log(`│  Output:           client-imports/${SLUG}/`);
console.log(`└──────────────────────────────────────────────────────────────`);

console.log(`
Next steps:
  1. Review:   client-imports/${SLUG}/client-manifest.json
               client-imports/${SLUG}/seed-preview.sql
               client-imports/${SLUG}/route-manifest.json
               client-imports/${SLUG}/generated-copy.json   ← hallucination review surface
               client-imports/${SLUG}/copy-scan.txt
  2. Upload:   images per client-imports/${SLUG}/media-manifest.json
  3. Approve:  yarn client:import --slug ${SLUG} --approve
  4. Apply:    yarn client:import --slug ${SLUG} --apply${ALLOW_STOCK ? " --allow-stock" : ""}
  5. Verify:   yarn client:verify --url http://localhost:3000 --vertical ${VERTICAL} --site-id site-${SLUG} --slug ${SLUG}
  6. Deploy + verify prod:
               yarn deploy
               yarn client:verify --url https://${SLUG}.krabiclaw.com --vertical ${VERTICAL} --site-id site-${SLUG} --slug ${SLUG}

  Or use the onboard wrapper (steps 1-5 in one command):
               yarn client:onboard --slug ${SLUG} --vertical ${VERTICAL}${ALLOW_STOCK ? " --allow-stock" : ""}
`);
