import assert from "node:assert/strict";
import test from "node:test";

import { describeErrorForTelemetry, errorChainForTelemetry } from "../../server/utils/error-telemetry.ts";
import { summarizeForTelemetry } from "../../server/utils/mcp-telemetry.ts";

test("oversized MCP summaries remain parseable JSON with redaction", () => {
  const summary = summarizeForTelemetry(Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`field_${index}`, '"\\\n'.repeat(80)])));
  assert.ok(summary);
  const parsed = JSON.parse(summary);
  assert.equal(parsed.truncated, true);
  assert.ok(parsed.summary.length <= 4000);
  assert.equal(JSON.parse(summarizeForTelemetry({ password: 'secret' })!).password, '[redacted]');
});

test("describeErrorForTelemetry preserves a nested database root cause", () => {
  const cause = new Error("D1_ERROR: CHECK constraint failed: media_assets_category_check");
  const error = new Error(
    `Failed query: INSERT INTO media_assets (${"column,".repeat(200)})\nparams: https://signed.example/secret,customer@example.com`,
    { cause },
  );

  const description = describeErrorForTelemetry(error, 500);

  assert.ok(description.length <= 500);
  assert.match(description, /^Failed query: INSERT INTO media_assets/);
  assert.match(description, /CHECK constraint failed: media_assets_category_check$/);
  assert.match(description, /middle truncated/);
  assert.doesNotMatch(description, /signed\.example|customer@example\.com/);
});

test("describeErrorForTelemetry handles circular cause chains", () => {
  const error = new Error("outer") as Error & { cause?: unknown };
  error.cause = error;

  assert.equal(describeErrorForTelemetry(error), "outer");
});

test("provider error chains retain the cause without logging credentials", () => {
  const cause = new Error("Invalid API Key provided: sk_test_example123; Authorization: Bearer private-token");
  cause.name = "StripeAuthenticationError";
  const chain = errorChainForTelemetry(new Error("Billing plans are temporarily unavailable", { cause }));

  assert.equal(chain[1]?.name, "StripeAuthenticationError");
  assert.match(chain[1]!.message, /Invalid API Key provided/);
  assert.doesNotMatch(JSON.stringify(chain), /sk_test_example123|private-token/);
});
