import test from "node:test";
import assert from "node:assert/strict";

import {
  compiledPotteryHouseSeed,
  potteryHouseFixture,
  renderCompiledPotteryHouseCoreSeedBlock,
  renderCompiledPotteryHouseMediaBlock,
  renderCompiledPotteryHouseExperiencesBlock,
  renderCompiledPotteryHouseReviewsBlock,
  renderCompiledPotteryHouseQaBlock,
  renderCompiledPotteryHousePostsBlock,
  renderCompiledPotteryHouseContentBlock,
  renderCompiledPotteryHouseTranslationsBlock,
  renderCompiledPotteryHouseBillingBlock,
} from "../../seed-definitions/pottery-house.ts";

test("pottery house fixture experience slugs are unique", () => {
  const slugs = potteryHouseFixture.experiences.map((e) => e.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("pottery house fixture public experience routes match seeded experiences", () => {
  const expectedPaths = potteryHouseFixture.experiences.map(
    (e) => `/experiences/${e.slug}`,
  );
  const actualPaths = potteryHouseFixture.publicRoutes
    .map((r) => r.path)
    .filter((p) => p !== "/experiences");

  assert.deepEqual(actualPaths.sort(), expectedPaths.sort());
});

test("compiled pottery house seed carries normalized route manifests", () => {
  assert.deepEqual(compiledPotteryHouseSeed.routeManifest.locations, [
    "/locations/krabi",
    "/locations/klong-muang-beach",
  ]);
  assert.deepEqual(compiledPotteryHouseSeed.routeManifest.experiences, [
    "/experiences/pottery-wheel-class",
    "/experiences/cocktails-and-clay",
    "/experiences/beachfront-pottery",
    "/experiences/monthly-membership",
  ]);
});

test("compiled pottery house seed normalizes org/site ids onto compiled rows", () => {
  assert.ok(
    compiledPotteryHouseSeed.mediaAssets.every(
      (a) => a.organizationId === "org-pottery-house",
    ),
  );
  assert.ok(
    compiledPotteryHouseSeed.mediaAssets.every(
      (a) => a.siteId === "site-pottery-house",
    ),
  );
  assert.ok(
    compiledPotteryHouseSeed.experiences.every(
      (e) => e.siteId === "site-pottery-house",
    ),
  );
  assert.ok(
    compiledPotteryHouseSeed.reviews.every(
      (r) => r.organizationId === "org-pottery-house",
    ),
  );
});

test("pottery house core block includes site, locale, domain, and location rows with contact_phone", () => {
  const sql = renderCompiledPotteryHouseCoreSeedBlock();

  assert.match(sql, /INSERT OR REPLACE INTO sites/);
  assert.match(sql, /contact_phone/);
  assert.match(sql, /\+66817794877/);
  assert.match(sql, /INSERT OR REPLACE INTO site_config/);
  assert.match(sql, /INSERT OR REPLACE INTO site_locales/);
  assert.match(sql, /INSERT OR REPLACE INTO site_domains/);
  assert.match(sql, /Pottery House Krabi/);
});

test("pottery house media block uses Cloudflare Images for seeded image assets and preserves hero refs", () => {
  const sql = renderCompiledPotteryHouseMediaBlock();

  assert.match(sql, /INSERT OR REPLACE INTO media_assets/);
  assert.match(sql, /cloudflare_image_id/);
  assert.match(sql, /cloudflare_images/);
  assert.match(sql, /7f1520e7-b6e4-4181-c689-0f1fc6bfaa00/);
  assert.match(sql, /INSERT OR REPLACE INTO business_locations/);
  assert.match(sql, /media-ph-homepage-custom/);
  assert.match(sql, /media-ph-beach-hero/);
});

test("pottery house experiences block includes all four experiences including membership with null capacity", () => {
  const sql = renderCompiledPotteryHouseExperiencesBlock();

  assert.match(sql, /INSERT OR REPLACE INTO experiences/);
  assert.match(sql, /pottery-wheel-class/);
  assert.match(sql, /cocktails-and-clay/);
  assert.match(sql, /beachfront-pottery/);
  assert.match(sql, /monthly-membership/);
  assert.match(sql, /loc-pottery-beachfront/);
});

test("pottery house reviews block includes reviews for both locations", () => {
  const sql = renderCompiledPotteryHouseReviewsBlock();

  assert.match(sql, /INSERT OR IGNORE INTO reviews/);
  assert.match(sql, /loc-pottery-house'/);
  assert.match(sql, /loc-pottery-beachfront'/);
  assert.match(sql, /Sophie L\./);
});

test("pottery house qa block includes Q&A for both locations", () => {
  const sql = renderCompiledPotteryHouseQaBlock();

  assert.match(sql, /INSERT OR IGNORE INTO location_qa/);
  assert.match(sql, /loc-pottery-house'/);
  assert.match(sql, /loc-pottery-beachfront'/);
  assert.match(sql, /Cocktails & Clay/);
});

test("pottery house posts block includes posts and channel jobs", () => {
  const sql = renderCompiledPotteryHousePostsBlock();

  assert.match(sql, /INSERT OR IGNORE INTO posts/);
  assert.match(sql, /INSERT OR IGNORE INTO post_channel_jobs/);
  assert.match(sql, /Doors open, wheels spinning\./);
  assert.match(sql, /IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO/);
});

test("pottery house content block includes home hero and about page content", () => {
  const sql = renderCompiledPotteryHouseContentBlock();

  assert.match(sql, /INSERT OR IGNORE INTO site_content/);
  assert.match(sql, /Clay, calm, and a place to return to\./);
  assert.match(sql, /hero_image_asset_id/);
  assert.match(sql, /story\.headline/);
  assert.match(sql, /journey\.body/);
});

test("pottery house translations block includes Thai content and location translations", () => {
  const sql = renderCompiledPotteryHouseTranslationsBlock();

  assert.match(sql, /INSERT OR IGNORE INTO site_content_translations/);
  assert.match(sql, /INSERT OR IGNORE INTO business_location_translations/);
  assert.match(sql, /ดินเผา ความสงบ และสถานที่ที่อยากกลับมา/);
  assert.match(sql, /loc-pottery-beachfront/);
});

test("pottery house billing block includes ai credits and site billing state", () => {
  const sql = renderCompiledPotteryHouseBillingBlock();

  assert.match(sql, /INSERT OR REPLACE INTO ai_credits/);
  assert.match(sql, /INSERT OR REPLACE INTO site_billing/);
  assert.match(sql, /INSERT OR REPLACE INTO site_entitlements/);
  assert.match(sql, /sb-site-pottery-house/);
  assert.match(sql, /managed/);
  assert.match(sql, /managed_service/);
  assert.match(sql, /google_business/);
});

test("pottery house compiled media assets carry Cloudflare provider metadata for uploaded assets", () => {
  const imageAssets = compiledPotteryHouseSeed.mediaAssets.filter(
    (a) => a.provider === "cloudflare_images",
  );
  assert.ok(imageAssets.length > 0);
  assert.equal(imageAssets.length, compiledPotteryHouseSeed.mediaAssets.length);
  assert.ok(imageAssets.every((a) => a.cloudflareImageId !== null));
  assert.ok(imageAssets.every((a) => a.r2Key === null));
  assert.ok(imageAssets.every((a) => a.source === "uploaded"));
});

test("pottery house compiled media assets preserve the Cloudflare media split", () => {
  const imageAssets = compiledPotteryHouseSeed.mediaAssets.filter((asset) =>
    asset.mimeType.startsWith("image/"),
  );
  const fileAssets = compiledPotteryHouseSeed.mediaAssets.filter(
    (asset) => !asset.mimeType.startsWith("image/"),
  );

  assert.ok(imageAssets.length > 0);
  assert.equal(imageAssets.length, compiledPotteryHouseSeed.mediaAssets.length);
  assert.ok(
    imageAssets.every((asset) => asset.provider === "cloudflare_images"),
  );
  assert.ok(imageAssets.every((asset) => asset.cloudflareImageId !== null));
  assert.ok(imageAssets.every((asset) => asset.r2Key === null));
  assert.equal(fileAssets.length, 0);
});
