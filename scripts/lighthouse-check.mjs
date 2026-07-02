#!/usr/bin/env node
// Repeatable Lighthouse check against a live URL. Runs N times and reports
// median/min/max instead of a single sample, because absolute numbers from
// any single run are sensitive to the machine's own network path to the
// target (TLS handshake / RTT to Cloudflare's edge can dominate LCP/FCP on a
// constrained connection, independent of anything the app is doing). A
// single run answers "what did this one sample look like"; median-of-N
// answers "did this actually change" — that's the question that matters when
// comparing before/after a deploy.
//
// IMPORTANT: server-response-time (TTFB) is the metric least sensitive to
// this confound — trust it most for judging server-side changes. Cross-check
// LCP/FCP/Speed Index against a real run from pagespeed.web.dev (Google's own
// infrastructure, not this machine) before concluding those regressed.
//
// Usage:
//   yarn perf:lighthouse --url https://www.example.com/ [--runs 3] [--form-factor mobile]

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      values[key] = "true";
      continue;
    }
    values[key] = next;
    i += 1;
  }
  return values;
}

const METRIC_AUDITS = [
  ["performance-score", null], // filled from categories, not audits
  ["largest-contentful-paint", "LCP"],
  ["first-contentful-paint", "FCP"],
  ["speed-index", "Speed Index"],
  ["total-blocking-time", "TBT"],
  ["interactive", "TTI"],
  ["cumulative-layout-shift", "CLS"],
  ["server-response-time", "TTFB"],
  ["total-byte-weight", "Total bytes"],
];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatMs(value) {
  if (value == null) return "n/a";
  return `${(value / 1000).toFixed(2)}s`;
}

async function runOnce(url, formFactor, outDir, index) {
  const outPath = path.join(outDir, `lh-${Date.now()}-${index}.json`);
  const args = [
    url,
    "--output=json",
    `--output-path=${outPath}`,
    "--chrome-flags=--headless --no-sandbox",
    `--form-factor=${formFactor}`,
    "--throttling-method=simulate",
    "--only-categories=performance",
    "--quiet",
  ];
  await execFileAsync("npx", ["--yes", "lighthouse", ...args], {
    maxBuffer: 1024 * 1024 * 50,
  });
  const { readFile } = await import("node:fs/promises");
  const report = JSON.parse(await readFile(outPath, "utf8"));
  const audits = report.audits ?? {};
  const result = {
    score: report.categories?.performance?.score ?? null,
    outPath,
  };
  for (const [key] of METRIC_AUDITS) {
    if (key === "performance-score") continue;
    result[key] = audits[key]?.numericValue ?? null;
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = args.url;
  if (!url) {
    console.error(
      "Usage: yarn perf:lighthouse --url <url> [--runs 3] [--form-factor mobile] [--output-dir test-results/lighthouse]",
    );
    process.exit(1);
  }
  const runs = Number(args.runs ?? 3);
  const formFactor = args["form-factor"] ?? "mobile";
  const outDir = args["output-dir"] ?? "test-results/lighthouse";
  await mkdir(outDir, { recursive: true });

  console.log(`[lighthouse-check] ${url} (${formFactor}, ${runs} runs)`);
  const results = [];
  for (let i = 0; i < runs; i += 1) {
    process.stdout.write(`  run ${i + 1}/${runs}... `);
    const result = await runOnce(url, formFactor, outDir, i);
    console.log(`score=${result.score} LCP=${formatMs(result["largest-contentful-paint"])} TTFB=${formatMs(result["server-response-time"])}`);
    results.push(result);
  }

  const summary = { url, formFactor, runs, timestamp: new Date().toISOString(), metrics: {} };
  console.log("\n=== Median across runs ===");
  for (const [key, label] of METRIC_AUDITS) {
    if (key === "performance-score") {
      const scores = results.map((r) => r.score).filter((v) => v != null);
      const m = median(scores);
      console.log(`Performance score: ${m?.toFixed(2) ?? "n/a"} (min=${Math.min(...scores).toFixed(2)}, max=${Math.max(...scores).toFixed(2)})`);
      summary.metrics.performanceScore = { median: m, min: Math.min(...scores), max: Math.max(...scores) };
      continue;
    }
    const values = results.map((r) => r[key]).filter((v) => v != null);
    if (values.length === 0) continue;
    const m = median(values);
    const isMs = key !== "cumulative-layout-shift" && key !== "total-byte-weight";
    const fmt = isMs ? formatMs : (v) => String(Math.round(v));
    console.log(`${label}: ${fmt(m)} (min=${fmt(Math.min(...values))}, max=${fmt(Math.max(...values))})`);
    summary.metrics[key] = { median: m, min: Math.min(...values), max: Math.max(...values) };
  }

  const summaryPath = path.join(outDir, `summary-${Date.now()}.json`);
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\n[done] Summary: ${summaryPath}`);
  console.log(
    "\nNote: LCP/FCP/Speed Index are sensitive to this machine's network path to the target.\n" +
    "TTFB (server-response-time) is the most trustworthy signal for server-side changes.\n" +
    "For an authoritative LCP/FCP number, cross-check against https://pagespeed.web.dev/ (runs from Google's own infrastructure).",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
