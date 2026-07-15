import assert from "node:assert/strict";
import test from "node:test";

import { describeErrorForTelemetry } from "../../server/utils/mcp-telemetry.ts";

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
