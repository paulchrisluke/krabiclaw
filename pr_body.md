Fixes #349

## Overview
Tenant custom domains (such as `www.potteryhousekrabi.com` and `www.kikuzuki-thailand.com`) were falling back to KrabiClaw platform icons due to implicit browser requests (`/favicon.ico` and `/apple-touch-icon.png`) being statically intercepted by Nitro's `public/` asset handler before tenant routing middleware could process them.

## Resolved Blocking Issues

1. **Format-Specific Routes & Resizing**:
   - Created `/tenant-icon-192.png` and `/tenant-icon-512.png` routes.
   - For Cloudflare Images URLs (`imagedelivery.net`), format-specific routes transform variant parameters (`w=96,h=96`, `w=180,h=180`, `w=192,h=192`, `w=512,h=512`) with `fit=pad` and `f=png` to return properly dimensioned PNG assets instead of raw unresized JPEGs/PNGs.
   - Made `/tenant-icon.svg` always return **real HTTP 200 SVG content** (`image/svg+xml`) by embedding the logo image inside an SVG canvas (`<svg><image href="..."/></svg>`) or rendering the tenant initial badge, eliminating 302 redirects to non-SVG images.

2. **Manifest Metadata & Sizes**:
   - Updated `server/routes/tenant.webmanifest.ts` to output distinct URLs:
     - `/tenant-icon-192.png?v=...` (sizes: `192x192`, type: `image/png`, purpose: `any maskable`)
     - `/tenant-icon-512.png?v=...` (sizes: `512x512`, type: `image/png`, purpose: `any maskable`)
     - `/tenant-icon.svg?v=...` (sizes: `any`, type: `image/svg+xml`, purpose: `any`)

3. **MIME Type Propagation**:
   - Updated `server/middleware/tenant-resolution.ts` to select `ma.mime_type AS logo_mime_type` from `media_assets` and expose `logo_mime_type` in `event.context.site`.
   - `buildTenantHeadLinks()` in `utils/tenant-head.ts` uses `tenantLogoMimeType` directly when available, ensuring format-neutral production URLs (e.g. Cloudflare Images ending in `/public`) derive correct `type` attributes or omit `type` for format-neutral redirects.

4. **Host-Aware `/site.webmanifest`**:
   - Moved `public/site.webmanifest` to `public/platform/site.webmanifest`.
   - Updated `server/routes/site.webmanifest.ts` to check host context: redirects platform hosts to `/platform/site.webmanifest` and tenant hosts to `/tenant.webmanifest`.

5. **Narrowed `isPlatformAssetUrl`**:
   - Only classifies URLs as platform assets if they originate from known platform domains (`krabiclaw.com`, `localhost`, etc.) or relative `/platform/...` paths, preserving external customer-hosted favicon URLs like `https://client.example/favicon.ico`.

6. **Endpoint & Host-Isolation Testing**:
   - Updated `tests/unit/tenant-favicon.test.ts` (7 passing unit tests covering extensionless URLs, MIME types, Cloudflare Images variant generation, SVG badge wrapping, and asset filtering).
   - Updated `tests/e2e/tenant-favicons.spec.ts` asserting endpoint responses, content types, manifests, and cross-host isolation for Pottery House and Kikuzuki.

## Verification Evidence

### Header & Endpoint Assertions
- `/tenant-icon.svg`: Status `200 OK`, `Content-Type: image/svg+xml`, `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`, `X-Robots-Tag` absent.
- `/tenant-icon-192.png`: Redirects/transforms to `w=192,h=192,fit=pad,f=png` with `Content-Type: image/png`.
- `/tenant-icon-512.png`: Redirects/transforms to `w=512,h=512,fit=pad,f=png` with `Content-Type: image/png`.
- `/apple-touch-icon.png`: Redirects/transforms to `w=180,h=180,fit=pad,f=png` with `Content-Type: image/png`.
- `/site.webmanifest` on tenant host: Redirects to `/tenant.webmanifest`, returning tenant name & icon entries.
- `/site.webmanifest` on platform host: Redirects to `/platform/site.webmanifest`.
