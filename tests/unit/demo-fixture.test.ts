import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  compiledDemoSeed,
  demoFixture,
  renderCompiledDemoCoreSeedBlock,
  renderCompiledDemoMediaBlock,
  renderCompiledDemoReviewsBlock,
  renderCompiledDemoMenuBlock,
  renderCompiledDemoQaBlock,
  renderCompiledDemoPostsBlock,
  renderDemoExperienceSeedBlock,
  renderCompiledDemoContentBlock,
  renderCompiledDemoTranslationsBlock,
  renderCompiledDemoBillingBlock,
} from "../../seed-definitions/demo.ts";
import { serializeCompiledSeedBundle } from "../../seed-definitions/serialize.ts";

test("demo fixture experience slugs are unique", () => {
  const slugs = demoFixture.experiences.map((experience) => experience.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("demo fixture public experience routes match seeded experiences", () => {
  const expectedPaths = demoFixture.experiences.map(
    (experience) => `/experiences/${experience.slug}`,
  );
  const actualPaths = demoFixture.publicRoutes
    .map((route) => route.path)
    .filter((path) => path !== "/experiences");

  assert.deepEqual(actualPaths.sort(), expectedPaths.sort());
});

test("compiled demo seed carries normalized route manifests for locations and experiences", () => {
  assert.deepEqual(compiledDemoSeed.routeManifest.locations, [
    "/locations/brooklyn",
    "/locations/west-village",
  ]);
  assert.deepEqual(compiledDemoSeed.routeManifest.experiences, [
    "/experiences/pizza-making-class",
    "/experiences/natural-wine-and-pizza-night",
    "/experiences/family-pizza-night",
  ]);
});

test("compiled demo seed normalizes org/site ids onto compiled rows", () => {
  assert.ok(
    compiledDemoSeed.mediaAssets.every(
      (asset) => asset.organizationId === demoFixture.organizationId,
    ),
  );
  assert.ok(
    compiledDemoSeed.mediaAssets.every(
      (asset) => asset.siteId === demoFixture.siteId,
    ),
  );
  assert.ok(
    compiledDemoSeed.siteContent.every(
      (entry) => entry.organizationId === demoFixture.organizationId,
    ),
  );
  assert.ok(
    compiledDemoSeed.experiences.every(
      (experience) => experience.siteId === demoFixture.siteId,
    ),
  );
});

test("compiled demo seed can be serialized into a deterministic artifact bundle", () => {
  const serialized = serializeCompiledSeedBundle(compiledDemoSeed);

  assert.equal(serialized.identity.fixtureId, "demo");
  assert.deepEqual(serialized.routeManifest, compiledDemoSeed.routeManifest);
  assert.deepEqual(serialized.publicRoutes[0], {
    path: "/experiences",
    titlePattern: "Experiences \\| Ember & Slice",
    titleFlags: "",
    text: "Pizza Making Class",
  });
});

test("checked-in demo bundle artifact matches the compiled demo seed", () => {
  const artifactPath = resolve(
    process.cwd(),
    "seed-definitions/generated/demo.bundle.json",
  );
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const compiledArtifact = JSON.parse(
    JSON.stringify(serializeCompiledSeedBundle(compiledDemoSeed)),
  );

  assert.deepEqual(artifact, compiledArtifact);
});

test("demo experience seed block contains only the experiences table", () => {
  const sql = renderDemoExperienceSeedBlock();

  assert.match(sql, /INSERT OR REPLACE INTO experiences/);
  assert.match(sql, /Pizza Making Class/);
  assert.doesNotMatch(sql, /INSERT OR REPLACE INTO media_assets/);
  assert.doesNotMatch(sql, /INSERT OR IGNORE INTO site_content/);
});

test("demo media block includes all media assets and hero refs", () => {
  const sql = renderCompiledDemoMediaBlock();

  assert.match(sql, /INSERT OR REPLACE INTO media_assets/);
  assert.match(sql, /cloudflare_image_id/);
  assert.match(sql, /r2_key/);
  assert.match(sql, /media-demo-hero/);
  assert.match(sql, /'video'/);
  assert.match(sql, /INSERT OR REPLACE INTO business_locations/);
  assert.match(sql, /hero_video_asset_id/);
});

test("demo reviews block includes reviews for both locations", () => {
  const sql = renderCompiledDemoReviewsBlock();

  assert.match(sql, /INSERT OR IGNORE INTO reviews/);
  assert.match(sql, /loc-demo'/);
  assert.match(sql, /loc-demo-2'/);
});

test("demo menu block includes menus and menu items", () => {
  const sql = renderCompiledDemoMenuBlock();

  assert.match(sql, /INSERT OR REPLACE INTO menus/);
  assert.match(sql, /INSERT OR IGNORE INTO menu_items/);
  assert.match(sql, /Margherita/);
  assert.match(sql, /menu-demo-2/);
});

test("demo qa block includes location Q&A for both locations", () => {
  const sql = renderCompiledDemoQaBlock();

  assert.match(sql, /INSERT OR IGNORE INTO location_qa/);
  assert.match(sql, /reservations/);
  assert.match(sql, /loc-demo-2'/);
});

test("demo posts block includes posts and channel jobs", () => {
  const sql = renderCompiledDemoPostsBlock();

  assert.match(sql, /INSERT OR IGNORE INTO posts/);
  assert.match(sql, /INSERT OR IGNORE INTO post_channel_jobs/);
  assert.match(sql, /Margherita Monday/);
});

test("demo content block includes site content for all pages including home hero fields", () => {
  const sql = renderCompiledDemoContentBlock();

  assert.match(sql, /INSERT OR IGNORE INTO site_content/);
  assert.match(sql, /hero_video_asset_id/);
  assert.match(sql, /Wood fire\. Brooklyn nights\./);
  assert.match(sql, /story\.title/);
  assert.match(sql, /hero\.kicker/);
});

test("demo translations block includes Thai translations for content, locations, and menus", () => {
  const sql = renderCompiledDemoTranslationsBlock();

  assert.match(sql, /INSERT OR IGNORE INTO site_content_translations/);
  assert.match(sql, /INSERT OR IGNORE INTO business_location_translations/);
  assert.match(sql, /INSERT OR IGNORE INTO menu_translations/);
  assert.match(sql, /INSERT OR IGNORE INTO menu_item_translations/);
  assert.match(sql, /ไฟฟืนและค่ำคืนในบรูคลิน/);
});

test("demo billing block includes ai credits and site billing state", () => {
  const sql = renderCompiledDemoBillingBlock();

  assert.match(sql, /INSERT OR REPLACE INTO ai_credits/);
  assert.match(sql, /INSERT OR REPLACE INTO site_billing/);
  assert.match(sql, /INSERT OR REPLACE INTO site_entitlements/);
  assert.match(sql, /127/);
  assert.match(sql, /sb-site-demo/);
  assert.match(sql, /sent-site-demo-plan/);
});

test("demo core seed block includes generated site, locale, domain, and location rows", () => {
  const sql = renderCompiledDemoCoreSeedBlock();

  assert.match(sql, /INSERT OR REPLACE INTO sites/);
  assert.match(sql, /INSERT OR REPLACE INTO site_config/);
  assert.match(sql, /INSERT OR REPLACE INTO site_locales/);
  assert.match(sql, /INSERT OR REPLACE INTO site_domains/);
  assert.match(sql, /source_locale/);
  assert.match(sql, /Ember & Slice/);
});

test("demo compiled media assets preserve the Cloudflare media split", () => {
  const imageAssets = compiledDemoSeed.mediaAssets.filter((asset) =>
    asset.mimeType.startsWith("image/"),
  );
  const fileAssets = compiledDemoSeed.mediaAssets.filter(
    (asset) => !asset.mimeType.startsWith("image/"),
  );

  assert.ok(imageAssets.length > 0);
  assert.ok(fileAssets.length > 0);
  assert.ok(
    imageAssets.every((asset) => asset.provider === "cloudflare_images"),
  );
  assert.ok(imageAssets.every((asset) => asset.cloudflareImageId !== null));
  assert.ok(imageAssets.every((asset) => asset.r2Key === null));
  assert.ok(fileAssets.every((asset) => asset.provider === "cloudflare_r2"));
  assert.ok(fileAssets.every((asset) => asset.r2Key !== null));
});
