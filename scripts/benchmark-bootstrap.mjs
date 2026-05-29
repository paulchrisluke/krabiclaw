import autocannon from "autocannon";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      values[key] = "true";
      continue;
    }
    values[key] = next;
    index += 1;
  }
  return values;
}

function toNumber(value, fallback) {
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function readPercentileValue(stats, percentileLabel) {
  const direct = stats?.[percentileLabel];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;

  // Autocannon exposes p97_5 but not always p95. Interpolate to keep p95 meaningful.
  if (percentileLabel === "p95") {
    const p90 = stats?.p90;
    const p97_5 = stats?.p97_5;
    if (
      typeof p90 === "number" &&
      Number.isFinite(p90) &&
      typeof p97_5 === "number" &&
      Number.isFinite(p97_5)
    ) {
      return p90 + ((p97_5 - p90) * (95 - 90)) / (97.5 - 90);
    }
  }

  return 0;
}

async function runAutocannon(url, options) {
  return new Promise((resolve, reject) => {
    autocannon(
      {
        url,
        method: "GET",
        connections: options.connections,
        duration: options.durationSeconds,
        amount: options.amount,
        timeout: options.timeoutSeconds,
        headers: {
          "cache-control": "no-cache",
        },
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      },
    );
  });
}

async function probeResponse(url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "cache-control": "no-cache" },
    });
    const buffer = await response.arrayBuffer();
    const endedAt = Date.now();
    return {
      statusCode: response.status,
      responseBytes: buffer.byteLength,
      singleRequestMs: endedAt - startedAt,
      errorMessage: null,
    };
  } catch (err) {
    const endedAt = Date.now();
    return {
      statusCode: 0,
      responseBytes: 0,
      singleRequestMs: endedAt - startedAt,
      errorMessage: err && err.message ? String(err.message) : "Unknown error",
    };
  }
}

function buildDefaultCases(params) {
  const { siteId, locationSlug, experienceSlug } = params;
  const pageCases = [
    { name: "home", relativePath: "/" },
    { name: "about", relativePath: "/about" },
    { name: "contact", relativePath: "/contact" },
    { name: "locations-index", relativePath: "/locations" },
    { name: "locations-detail", relativePath: `/locations/${locationSlug}` },
    {
      name: "locations-reviews",
      relativePath: `/locations/${locationSlug}/reviews`,
    },
    {
      name: "locations-photos",
      relativePath: `/locations/${locationSlug}/photos`,
    },
    { name: "locations-qa", relativePath: `/locations/${locationSlug}/qa` },
    { name: "posts", relativePath: "/posts" },
    { name: "reviews", relativePath: "/reviews" },
    { name: "qa", relativePath: "/qa" },
    { name: "experiences-index", relativePath: "/experiences" },
    {
      name: "experiences-detail",
      relativePath: `/experiences/${experienceSlug}`,
    },
    { name: "reservations", relativePath: "/reservations" },
  ];

  const apiCases = siteId
    ? [
        {
          name: "api-bootstrap-home",
          relativePath: `/api/public/sites/${siteId}/bootstrap?page=home&menu=1`,
        },
        {
          name: "api-bootstrap-locations",
          relativePath: `/api/public/sites/${siteId}/bootstrap?page=locations&menu=1`,
        },
        {
          name: "api-bootstrap-location-reviews",
          relativePath: `/api/public/sites/${siteId}/bootstrap?page=reviews&location=${locationSlug}&data=reviews`,
        },
        {
          name: "api-bootstrap-location-photos",
          relativePath: `/api/public/sites/${siteId}/bootstrap?page=photos&location=${locationSlug}&data=photos`,
        },
        {
          name: "api-bootstrap-location-qa",
          relativePath: `/api/public/sites/${siteId}/bootstrap?page=qa&location=${locationSlug}&data=qa`,
        },
        {
          name: "api-bootstrap-posts",
          relativePath: `/api/public/sites/${siteId}/bootstrap?page=posts`,
        },
        {
          name: "api-bootstrap-experiences-list",
          relativePath: `/api/public/sites/${siteId}/bootstrap?page=experiences`,
        },
        {
          name: "api-bootstrap-experiences-detail",
          relativePath: `/api/public/sites/${siteId}/bootstrap?page=experiences&experience=${experienceSlug}`,
        },
      ]
    : [];

  return [...pageCases, ...apiCases];
}

function toAbsoluteUrl(baseUrl, relativePath) {
  return new URL(relativePath, baseUrl).toString();
}

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help === "true" || args.h === "true") {
    console.log(
      `Usage: yarn benchmark:bootstrap --base-url https://pottery-house.krabiclaw.com --site-id <siteId> [options]\n\nOptions:\n  --base-url            Base URL to benchmark (required)\n  --site-id             Site ID for bootstrap API test cases (optional but recommended)\n  --location-slug       Location slug used for route/API cases (default: ao-nang)\n  --experience-slug     Experience slug used for route/API cases (default: wheel-throwing-workshop)\n  --runs                Number of autocannon runs per case (default: 5)\n  --warmup-runs         Warmup runs per case, excluded from metrics (default: 1)\n  --connections         Concurrent connections for autocannon (default: 10)\n  --duration            Duration in seconds per run (default: 10)\n  --amount              Fixed number of requests per run (optional; overrides duration when set)\n  --timeout             Request timeout in seconds (default: 15)\n  --output-dir          Output directory (default: test-results/bootstrap-benchmarks)\n`,
    );
    return;
  }

  const baseUrl = args["base-url"];
  if (!baseUrl) {
    throw new Error("Missing required --base-url. Run with --help for usage.");
  }

  const config = {
    baseUrl,
    siteId: args["site-id"] || "",
    locationSlug: args["location-slug"] || "ao-nang",
    experienceSlug: args["experience-slug"] || "wheel-throwing-workshop",
    runs: Math.max(1, toNumber(args.runs, 5)),
    warmupRuns: Math.max(0, toNumber(args["warmup-runs"], 1)),
    connections: Math.max(1, toNumber(args.connections, 10)),
    durationSeconds: Math.max(1, toNumber(args.duration, 10)),
    amount: args.amount ? Math.max(1, toNumber(args.amount, 0)) : undefined,
    timeoutSeconds: Math.max(1, toNumber(args.timeout, 15)),
    outputDir: args["output-dir"] || "test-results/bootstrap-benchmarks",
  };

  const cases = buildDefaultCases({
    siteId: config.siteId,
    locationSlug: config.locationSlug,
    experienceSlug: config.experienceSlug,
  });

  const startedAtIso = new Date().toISOString();
  const timestamp = startedAtIso.replaceAll(":", "-").replace(/\..+$/, "Z");

  const results = [];
  for (const testCase of cases) {
    const absoluteUrl = toAbsoluteUrl(config.baseUrl, testCase.relativePath);
    console.log(`\n[benchmark] ${testCase.name} -> ${absoluteUrl}`);

    const probe = await probeResponse(absoluteUrl);
    const runSamples = [];

    for (
      let warmupIndex = 0;
      warmupIndex < config.warmupRuns;
      warmupIndex += 1
    ) {
      console.log(
        `[warmup ${warmupIndex + 1}/${config.warmupRuns}] ${testCase.name}`,
      );
      await runAutocannon(absoluteUrl, config);
    }

    for (let runIndex = 0; runIndex < config.runs; runIndex += 1) {
      console.log(`[run ${runIndex + 1}/${config.runs}] ${testCase.name}`);
      const result = await runAutocannon(absoluteUrl, config);
      runSamples.push(result);
    }

    const p95s = runSamples
      .map((sample) => readPercentileValue(sample.latency, "p95"))
      .sort((a, b) => a - b);
    const p99s = runSamples
      .map((sample) => sample.latency?.p99 || 0)
      .sort((a, b) => a - b);
    const p50s = runSamples
      .map((sample) => sample.latency?.p50 || 0)
      .sort((a, b) => a - b);
    const reqRates = runSamples
      .map((sample) => sample.requests?.average || 0)
      .sort((a, b) => a - b);
    const byteRates = runSamples
      .map((sample) => sample.throughput?.average || 0)
      .sort((a, b) => a - b);

    const totalErrors = runSamples.reduce(
      (sum, sample) => sum + (sample.errors || 0),
      0,
    );
    const totalTimeouts = runSamples.reduce(
      (sum, sample) => sum + (sample.timeouts || 0),
      0,
    );
    const totalAttempts = runSamples.reduce((sum, sample) => {
      const sent = sample.requests?.sent;
      if (typeof sent === "number" && Number.isFinite(sent)) return sum + sent;
      const completed = sample.requests?.total;
      if (typeof completed === "number" && Number.isFinite(completed)) {
        return sum + completed;
      }
      return sum;
    }, 0);
    const statusCodeDistribution = runSamples.reduce((acc, sample) => {
      const total =
        (sample["1xx"] || 0) +
        (sample["2xx"] || 0) +
        (sample["3xx"] || 0) +
        (sample["4xx"] || 0) +
        (sample["5xx"] || 0);
      acc["1xx"] = (acc["1xx"] || 0) + (sample["1xx"] || 0);
      acc["2xx"] = (acc["2xx"] || 0) + (sample["2xx"] || 0);
      acc["3xx"] = (acc["3xx"] || 0) + (sample["3xx"] || 0);
      acc["4xx"] = (acc["4xx"] || 0) + (sample["4xx"] || 0);
      acc["5xx"] = (acc["5xx"] || 0) + (sample["5xx"] || 0);
      if (total === 0) {
        acc.none = (acc.none || 0) + 1;
      }
      return acc;
    }, {});

    results.push({
      name: testCase.name,
      path: testCase.relativePath,
      url: absoluteUrl,
      statusCode: probe.statusCode,
      responseBytes: probe.responseBytes,
      singleRequestMs: probe.singleRequestMs,
      p50Ms: quantile(p50s, 0.5),
      p95Ms: quantile(p95s, 0.5),
      p99Ms: quantile(p99s, 0.5),
      requestsPerSec: quantile(reqRates, 0.5),
      bytesPerSec: quantile(byteRates, 0.5),
      errors: totalErrors,
      timeouts: totalTimeouts,
      attempts: totalAttempts,
      errorRate: (totalErrors + totalTimeouts) / Math.max(1, totalAttempts),
      statusCodeDistribution,
      samples: runSamples.map((sample) => ({
        latency: sample.latency,
        requests: sample.requests,
        throughput: sample.throughput,
        errors: sample.errors,
        timeouts: sample.timeouts,
      })),
    });
  }

  const p95List = results.map((item) => item.p95Ms);
  const responseBytesList = results.map((item) => item.responseBytes);
  const summary = {
    startedAt: startedAtIso,
    completedAt: new Date().toISOString(),
    config,
    routesBenchmarked: results.length,
    aggregate: {
      medianP95Ms:
        p95List.length > 0
          ? quantile(
              p95List.sort((a, b) => a - b),
              0.5,
            )
          : null,
      medianResponseBytes:
        responseBytesList.length > 0
          ? quantile(
              responseBytesList.sort((a, b) => a - b),
              0.5,
            )
          : null,
      maxP95Ms: p95List.length > 0 ? Math.max(...p95List) : null,
      totalErrors: results.reduce(
        (sum, item) => sum + item.errors + item.timeouts,
        0,
      ),
    },
    results,
  };

  const outputDirAbsolute = path.resolve(process.cwd(), config.outputDir);
  await mkdir(outputDirAbsolute, { recursive: true });

  const jsonPath = path.join(outputDirAbsolute, `benchmark-${timestamp}.json`);
  const markdownPath = path.join(
    outputDirAbsolute,
    `benchmark-${timestamp}.md`,
  );

  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const rows = results
    .map(
      (item) =>
        `| ${item.name} | ${item.statusCode} | ${item.responseBytes} | ${formatMs(item.p50Ms)} | ${formatMs(item.p95Ms)} | ${formatMs(item.p99Ms)} | ${item.requestsPerSec.toFixed(2)} | ${item.bytesPerSec.toFixed(0)} | ${(item.errorRate * 100).toFixed(2)}% |`,
    )
    .join("\n");

  const markdown = `# Bootstrap Benchmark\n\n- Started: ${summary.startedAt}\n- Completed: ${summary.completedAt}\n- Base URL: ${config.baseUrl}\n- Runs per case: ${config.runs}\n- Warmup runs: ${config.warmupRuns}\n- Connections: ${config.connections}\n- Duration (seconds): ${config.durationSeconds}\n\n## Aggregate\n\n- Median p95: ${formatMs(summary.aggregate.medianP95Ms)}\n- Median response bytes: ${summary.aggregate.medianResponseBytes.toFixed(0)}\n- Max p95: ${formatMs(summary.aggregate.maxP95Ms)}\n- Total errors/timeouts: ${summary.aggregate.totalErrors}\n\n## Per Route\n\n| Route | Status | Response Bytes | p50 | p95 | p99 | Req/s | Bytes/s | Error Rate |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n\n`;

  await writeFile(markdownPath, markdown, "utf8");

  console.log(`\n[done] JSON: ${jsonPath}`);
  console.log(`[done] Markdown: ${markdownPath}`);
}

main().catch((error) => {
  console.error("[benchmark] Failed:", error);
  process.exitCode = 1;
});
