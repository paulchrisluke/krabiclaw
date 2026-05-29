#!/usr/bin/env node
/**
 * Post-deploy smoke test for a KrabiClaw tenant site.
 *
 * Usage:
 *   node scripts/client-verify.mjs --url https://pottery-house.krabiclaw.com --vertical experience
 *   node scripts/client-verify.mjs --url https://pottery-house.krabiclaw.com --vertical experience \
 *     --site-id site-pottery-house --slug pottery-house-krabi
 *
 * With --slug, writes reports to client-imports/<slug>/:
 *   verify-report.latest.json    — structured results for this run
 *   verify-report.previous.json  — previous run (for diffing)
 *   verify-diff.txt              — regression diff between runs
 *   verify-report.txt            — human-readable summary
 *   client-handoff.md            — client-ready handoff document (on pass)
 *
 * Exit code 0 = all checks passed. Non-zero = failures found.
 */

import { parseArgs } from "node:util";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { existsSync } from "node:fs";

const { values: args } = parseArgs({
  options: {
    url: { type: "string" },
    vertical: { type: "string", default: "restaurant" },
    "site-id": { type: "string" },
    slug: { type: "string" },
    "out-dir": { type: "string" },
    remote: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (!args.url) {
  console.error(
    "Usage: node scripts/client-verify.mjs --url <site-url> --vertical <vertical> [--site-id <id>] [--slug <slug>]",
  );
  process.exit(1);
}

const BASE = args.url.replace(/\/$/, "");
const VERTICAL = args.vertical;
const SITE_ID = args["site-id"];
const OUT_DIR =
  args["out-dir"] ??
  (args.slug ? join(process.cwd(), "client-imports", args.slug) : null);

// ── Copy constraints ──────────────────────────────────────────────────────────

const FORBIDDEN_COPY = {
  experience: [
    "Come dine with us",
    "Reserve a table",
    "From the kitchen",
    "one kitchen philosophy",
    "Catering & events",
    "chef's table",
    "tasting menu",
    "dine differently",
    "Also part of Saya",
    "Ember & Slice",
    "kikuzuki",
  ],
  restaurant: [],
  retail: [],
  wellness: [],
  service: [],
};

const REQUIRED_COPY = {
  experience: [
    { pattern: /book a class/i, label: 'CTA: "Book a class"' },
    { pattern: /from the studio/i, label: 'Posts eyebrow: "From the studio"' },
  ],
  restaurant: [],
  retail: [],
  wellness: [],
  service: [],
};

// ── Route lists ───────────────────────────────────────────────────────────────

const CORE_ROUTES = [
  "/",
  "/locations",
  "/reviews",
  "/qa",
  "/posts",
  "/about",
  "/contact",
];

const VERTICAL_ROUTES = {
  experience: ["/experiences", "/reservations"],
  restaurant: ["/menu", "/reservations"],
  retail: ["/locations"],
  wellness: ["/experiences", "/reservations"],
  service: ["/reservations"],
};

const REQUIRED_ROUTES_BY_VERTICAL = {
  experience: [...CORE_ROUTES, "/experiences", "/reservations"],
  restaurant: [...CORE_ROUTES, "/menu", "/reservations"],
  retail: [...CORE_ROUTES],
  wellness: [...CORE_ROUTES, "/experiences", "/reservations"],
  service: [...CORE_ROUTES, "/reservations"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

let failures = 0;
let passes = 0;

const reportLines = [];
const reportResults = [];

function pass(msg) {
  console.log(`  ✓ ${msg}`);
  reportLines.push(`PASS  ${msg}`);
  reportResults.push({ status: "pass", message: msg });
  passes++;
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  reportLines.push(`FAIL  ${msg}`);
  reportResults.push({ status: "fail", message: msg });
  failures++;
}
function info(msg) {
  console.log(`\n${msg}`);
  reportLines.push(`\n${msg}`);
}

async function get(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      ...opts,
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      text: async () => "",
      json: async () => ({}),
      statusText: err.message,
    };
  }
}

// Bootstrap is fetched once and cached — phases 3, 6, 7 all reuse it
let _bootstrapData = null;
async function getBootstrap() {
  if (_bootstrapData !== null) return _bootstrapData;
  if (!SITE_ID) return null;
  const res = await get(`/api/public/sites/${SITE_ID}/bootstrap`);
  if (!res.ok) return null;
  _bootstrapData = await res.json();
  return _bootstrapData;
}

// ── Phase 1: Route status codes ───────────────────────────────────────────────

info("── Route status checks");

const routes = REQUIRED_ROUTES_BY_VERTICAL[VERTICAL] ?? [
  ...CORE_ROUTES,
  ...(VERTICAL_ROUTES[VERTICAL] ?? []),
];
const pageHtml = {};

for (const route of routes) {
  const res = await get(route);
  if (res.ok) {
    pass(`GET ${route} → ${res.status}`);
    pageHtml[route] = await res.text();
  } else {
    fail(`GET ${route} → ${res.status} ${res.statusText}`);
  }
}

// ── Phase 1b: Route manifest verification ────────────────────────────────────

if (OUT_DIR) {
  const routeManifestPath = join(OUT_DIR, "route-manifest.json");
  if (existsSync(routeManifestPath)) {
    info("── Route manifest checks (from client:import dry-run)");
    const routeManifest = JSON.parse(await readFile(routeManifestPath, "utf8"));

    for (const route of [
      ...(routeManifest.locations ?? []),
      ...(routeManifest.experiences ?? []),
    ]) {
      if (pageHtml[route]) {
        pass(`Route manifest: ${route} (already verified)`);
        continue;
      }
      const res = await get(route);
      if (res.ok) {
        pass(`Route manifest: GET ${route} → ${res.status}`);
        pageHtml[route] = await res.text();
      } else {
        const kind = routeManifest.locations?.includes(route)
          ? "location"
          : "experience";
        fail(
          `Route manifest: GET ${route} → ${res.status} — expected ${kind} slug missing`,
        );
      }
    }
  }
}

// ── Phase 2: Experience / menu slug routing ───────────────────────────────────

if (SITE_ID && (VERTICAL === "experience" || VERTICAL === "restaurant")) {
  info("── Slug route checks");

  const contentType = VERTICAL === "experience" ? "experiences" : "menu";
  const apiPath = `/api/public/sites/${SITE_ID}/bootstrap?page=${contentType}`;
  const res = await get(apiPath);

  if (res.ok) {
    const data = await res.json();
    const items =
      VERTICAL === "experience"
        ? (data.experiencesList ?? [])
        : (data.menu?.items ?? []);

    if (items.length === 0) {
      fail(`Bootstrap returned 0 ${contentType} items — nothing to slug-check`);
    } else {
      for (const item of items.slice(0, 5)) {
        if (!item.slug) continue;
        const route = `/${contentType}/${item.slug}`;
        const r = await get(route);
        if (r.ok) {
          pass(`GET ${route} → ${r.status}`);
          pageHtml[route] = await r.text();
        } else {
          fail(`GET ${route} → ${r.status}`);
        }
      }
    }
  } else {
    fail(`Bootstrap API ${apiPath} → ${res.status}`);
  }
}

// ── Phase 3: Location slug routing ───────────────────────────────────────────

if (SITE_ID) {
  info("── Location slug checks");
  const data = await getBootstrap();

  if (data) {
    const locs = data.locations ?? [];
    if (locs.length === 0) {
      fail("Bootstrap returned 0 locations");
    } else {
      for (const loc of locs) {
        const route = `/locations/${loc.slug}`;
        if (pageHtml[route]) {
          pass(`GET ${route} → cached`);
          continue;
        }
        const r = await get(route);
        if (r.ok) {
          pass(`GET ${route} → ${r.status}`);
          pageHtml[route] = await r.text();
        } else {
          fail(`GET ${route} → ${r.status}`);
        }
      }
    }
  } else {
    fail("Bootstrap API unavailable — location slug checks skipped");
  }
}

// ── Phase 4: Forbidden copy scan ─────────────────────────────────────────────

info("── Forbidden copy scan");

const forbidden = FORBIDDEN_COPY[VERTICAL] ?? [];
const foundViolations = [];
for (const [route, html] of Object.entries(pageHtml)) {
  for (const str of forbidden) {
    if (html.toLowerCase().includes(str.toLowerCase())) {
      foundViolations.push({ route, str });
    }
  }
}

if (foundViolations.length > 0) {
  fail(
    `Forbidden copy found: ${foundViolations.map((f) => `"${f.str}" on ${f.route}`).join(", ")}`,
  );
} else if (forbidden.length === 0) {
  pass("No forbidden copy to scan (or no HTML fetched)");
} else {
  pass("Forbidden copy scan complete");
}

// ── Phase 5: Required copy check ─────────────────────────────────────────────

info("── Required copy check");

const required = REQUIRED_COPY[VERTICAL] ?? [];
if (required.length > 0) {
  const allHtml = Object.values(pageHtml).join("\n");
  for (const { pattern, label } of required) {
    if (pattern.test(allHtml)) pass(`Found required copy: ${label}`);
    else fail(`Missing required copy: ${label}`);
  }
}

// ── Phase 6: Bootstrap image URL validation ───────────────────────────────────

if (SITE_ID) {
  info("── Bootstrap image URL validation");
  const data = await getBootstrap();

  if (data) {
    const imageUrls = new Set();
    for (const loc of data.locations ?? []) {
      if (loc.hero_image_public_url) imageUrls.add(loc.hero_image_public_url);
      if (loc.hero_video_public_url) imageUrls.add(loc.hero_video_public_url);
      if (loc.public_url) imageUrls.add(loc.public_url);
    }
    for (const exp of data.experiencesList ?? []) {
      if (exp.image_url) imageUrls.add(exp.image_url);
    }

    if (imageUrls.size === 0) {
      fail("No image URLs found in bootstrap response");
    } else {
      for (const url of imageUrls) {
        if (!url || url.startsWith("data:")) continue;
        const r = await get(url, { method: "HEAD" });
        if (r.ok) pass(`Image OK: ${url.slice(0, 80)}`);
        else fail(`Image ${r.status}: ${url.slice(0, 80)}`);
      }
    }
  }
}

// ── Phase 7: Contact data ─────────────────────────────────────────────────────

if (SITE_ID) {
  info("── Contact data check");
  const data = await getBootstrap();

  if (data) {
    const phones = (data.locations ?? []).map((l) => l.phone).filter(Boolean);
    const emails = Object.values(data.config ?? {}).filter(
      (v) => typeof v === "string" && v.includes("@"),
    );

    if (phones.length > 0) pass(`Phone present: ${phones[0]}`);
    else fail("No phone number in any location");

    if (emails.length > 0) pass(`Email present: ${emails[0]}`);
    else fail("No contact email in site config");

    const allJson = JSON.stringify(data);
    if (allJson.includes("bamboo.chow@gmail.com") && VERTICAL !== "experience")
      fail("Kikuzuki placeholder email found in production data");
    if (allJson.includes("Ember & Slice"))
      fail("Demo site data (Ember & Slice) found in production response");

    // Guard: static fallback phone must not be served
    if (allJson.includes("+66 81 270 2616") && !allJson.includes("bamboo")) {
      fail(
        "Static Saya fallback phone number found — location phone is not client data",
      );
    }
  }
}

// ── Phase 7b: Media manifest provenance check ─────────────────────────────────

if (OUT_DIR) {
  const mediaManifestPath = join(OUT_DIR, "media-manifest.json");
  if (existsSync(mediaManifestPath)) {
    info("── Media provenance check");
    const media = JSON.parse(await readFile(mediaManifestPath, "utf8"));
    const allHtml = Object.values(pageHtml).join("\n");

    for (const file of media.files ?? []) {
      const localExists = file.source_file
        ? existsSync(file.source_file)
        : false;
      const localLabel = localExists ? "yes" : "no";

      // HEAD check against deployed public URL
      let httpStatus = "n/a";
      if (file.public_url) {
        const r = await get(file.public_url, { method: "HEAD" });
        httpStatus = r.ok ? String(r.status) : String(r.status || "err");
      }

      const usedOnPage = file.public_url
        ? allHtml.includes(file.public_url)
        : false;

      const label = `${file.normalized_name ?? file.original_name}: local=${localLabel} public=${httpStatus} on-page=${usedOnPage ? "yes" : "no"}`;

      if (httpStatus !== "n/a" && !["200", "304"].includes(httpStatus)) {
        fail(`Media: ${label}`);
      } else {
        pass(`Media: ${label}`);
      }
    }

    if ((media.files ?? []).length === 0) {
      info("  (no media files in manifest)");
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const summaryLine = `  ${passes} passed  ${failures} failed`;
console.log(`\n${"─".repeat(60)}`);
console.log(summaryLine);
console.log(`${"─".repeat(60)}`);

// ── Phase 8: Write report files with diffing ──────────────────────────────────

if (OUT_DIR) {
  await mkdir(OUT_DIR, { recursive: true });

  const reportJson = {
    verified_at: new Date().toISOString(),
    url: BASE,
    vertical: VERTICAL,
    site_id: SITE_ID ?? null,
    passes,
    failures,
    passed: failures === 0,
    results: reportResults,
  };

  // Rotate previous report
  const latestPath = join(OUT_DIR, "verify-report.latest.json");
  const previousPath = join(OUT_DIR, "verify-report.previous.json");
  const diffPath = join(OUT_DIR, "verify-diff.txt");
  const txtPath = join(OUT_DIR, "verify-report.txt");

  let previousReport = null;
  if (existsSync(latestPath)) {
    try {
      previousReport = JSON.parse(await readFile(latestPath, "utf8"));
      await writeFile(
        previousPath,
        JSON.stringify(previousReport, null, 2),
        "utf8",
      );
    } catch {
      // Ignore read/write errors
    }
  }

  await writeFile(latestPath, JSON.stringify(reportJson, null, 2), "utf8");

  // Write human-readable txt
  const txtLines = [
    "KrabiClaw Site Verification Report",
    `URL:      ${BASE}`,
    `Vertical: ${VERTICAL}`,
    `Date:     ${reportJson.verified_at}`,
    `Result:   ${failures === 0 ? "PASSED" : "FAILED"}`,
    "─".repeat(60),
    ...reportLines,
    "─".repeat(60),
    summaryLine,
  ];
  await writeFile(txtPath, txtLines.join("\n") + "\n", "utf8");

  // Generate diff vs previous run
  if (previousReport) {
    const prevByMsg = new Map(
      previousReport.results.map((r) => [r.message, r.status]),
    );
    const diffLines = [
      `Verify diff: ${previousReport.verified_at} → ${reportJson.verified_at}`,
      "─".repeat(60),
    ];
    let regressions = 0;
    let fixes = 0;
    let unchanged = 0;

    for (const r of reportResults) {
      const prev = prevByMsg.get(r.message);
      if (!prev) {
        diffLines.push(`  NEW   [${r.status.toUpperCase()}] ${r.message}`);
      } else if (prev !== r.status) {
        const arrow = r.status === "fail" ? "⬇ REGRESSED" : "⬆ FIXED";
        diffLines.push(`  ${arrow}  ${r.message}`);
        if (r.status === "fail") regressions++;
        else fixes++;
      } else {
        unchanged++;
      }
    }

    // Report checks that disappeared
    const newMsgs = new Set(reportResults.map((r) => r.message));
    for (const [msg, status] of prevByMsg) {
      if (!newMsgs.has(msg))
        diffLines.push(`  GONE  [${status.toUpperCase()}] ${msg}`);
    }

    diffLines.push("─".repeat(60));
    diffLines.push(
      `  ${regressions} regression(s)  ${fixes} fix(es)  ${unchanged} unchanged`,
    );

    await writeFile(diffPath, diffLines.join("\n") + "\n", "utf8");

    if (regressions > 0) {
      console.error(
        `\n  ⚠ ${regressions} regression(s) vs previous run — see ${relative(process.cwd(), diffPath)}`,
      );
    } else if (fixes > 0) {
      console.log(`\n  ↑ ${fixes} fix(es) vs previous run`);
    }
  }

  console.log(`\n  Reports:`);
  console.log(`    ${relative(process.cwd(), latestPath)}`);
  if (previousReport) console.log(`    ${relative(process.cwd(), diffPath)}`);
  console.log(`    ${relative(process.cwd(), txtPath)}`);
}

// ── Phase 9: Client handoff document ─────────────────────────────────────────

if (OUT_DIR && failures === 0) {
  const clientManifestPath = join(OUT_DIR, "client-manifest.json");
  const data = await getBootstrap();

  const handoffLines = [
    `# Client Handoff: ${args.slug ?? SITE_ID ?? BASE}`,
    "",
    `**Verified:** ${new Date().toISOString().slice(0, 10)}  `,
    `**Status:** PASSED (${passes} checks)  `,
    `**Vertical:** ${VERTICAL}  `,
    "",
    "## Live Site",
    "",
    `- URL: ${BASE}`,
    "",
  ];

  if (data?.locations?.length) {
    handoffLines.push("## Locations", "");
    for (const loc of data.locations) {
      handoffLines.push(`### ${loc.title ?? loc.slug}`);
      if (loc.phone) handoffLines.push(`- Phone: ${loc.phone}`);
      if (loc.address) handoffLines.push(`- Address: ${loc.address}`);
      if (loc.maps_url) handoffLines.push(`- Maps: ${loc.maps_url}`);
      if (loc.opening_hours) {
        let hours = loc.opening_hours;
        try {
          hours =
            JSON.parse(loc.opening_hours)?.weekday_text?.join(", ") ?? hours;
        } catch {
          // Ignore parse errors
        }
        handoffLines.push(
          `- Hours: ${typeof hours === "string" ? hours.slice(0, 120) : JSON.stringify(hours).slice(0, 120)}`,
        );
      }
      handoffLines.push("");
    }
  }

  if (data?.config) {
    const emails = Object.values(data.config).filter(
      (v) => typeof v === "string" && v.includes("@"),
    );
    if (emails.length) {
      handoffLines.push("## Contact Email", "", `- ${emails[0]}`, "");
    }
  }

  // Experience slugs from page HTML discovery
  const expRoutes = Object.keys(pageHtml).filter((r) =>
    r.startsWith("/experiences/"),
  );
  if (expRoutes.length) {
    handoffLines.push("## Experience Slugs", "");
    for (const r of expRoutes) handoffLines.push(`- ${BASE}${r}`);
    handoffLines.push("");
  }

  // Image count from media manifest
  const mediaManifestPath = join(OUT_DIR, "media-manifest.json");
  if (existsSync(mediaManifestPath)) {
    const media = JSON.parse(await readFile(mediaManifestPath, "utf8"));
    if (media.files?.length) {
      handoffLines.push(`## Images (${media.files.length} total)`, "");
      for (const f of media.files) {
        handoffLines.push(
          `- \`${f.public_url}\` — ${f.assigned_to} (${f.hash?.slice(0, 19) ?? "no hash"})`,
        );
      }
      handoffLines.push("");
    }
  }

  // Google source URLs from client manifest
  if (existsSync(clientManifestPath)) {
    const manifest = JSON.parse(await readFile(clientManifestPath, "utf8"));
    const sources = [
      manifest.primary_location?.source_url,
      ...(manifest.secondary_locations ?? []).map((l) => l.source_url),
    ].filter(Boolean);
    if (sources.length) {
      handoffLines.push("## Google Source URLs", "");
      for (const s of sources) handoffLines.push(`- ${s}`);
      handoffLines.push("");
    }
  }

  // Missing fields
  const missingPath = join(OUT_DIR, "missing-fields.json");
  if (existsSync(missingPath)) {
    const missing = JSON.parse(await readFile(missingPath, "utf8"));
    if (missing.length) {
      handoffLines.push("## Known Missing Fields", "");
      for (const m of missing)
        handoffLines.push(
          `- **${m.location}**: ${m.field}${m.issue ? ` (${m.issue})` : ""}`,
        );
      handoffLines.push("");
    } else {
      handoffLines.push("## Known Missing Fields", "", "- None", "");
    }
  }

  handoffLines.push(
    "## Verification Summary",
    "",
    `${passes} checks passed, ${failures} failed.`,
  );

  const handoffPath = join(OUT_DIR, "client-handoff.md");
  await writeFile(handoffPath, handoffLines.join("\n") + "\n", "utf8");
  console.log(
    `    ${relative(process.cwd(), handoffPath)}  ← client handoff ready`,
  );
}

if (failures > 0) {
  console.error(`\n  FAILED — fix the issues above before shipping\n`);
  process.exit(1);
} else {
  console.log(`\n  PASSED — site looks good\n`);
  process.exit(0);
}
