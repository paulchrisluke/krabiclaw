# Stripe catalog operator plan

`scripts/seed-stripe.mjs` reconciles only the recurring Growth, Managed, and SEO
Accelerator products. Amounts are fixed at `$49`, `$149`, and `$349` per month;
the script does not create one-time credit, add-on, or auto-top-up products.

The default mode is read-only. It lists active products and the relevant
recurring prices, writes no product/price/file mutations, and emits a
deterministic JSON plan with a SHA-256 hash:

```bash
STRIPE_SECRET_KEY=rk_test_... yarn stripe:catalog:plan \
  > .tmp/stripe-catalog-plan.json
```

Release preflight runs the same read-only planner with an explicit test-mode
guard. The guard is checked before the Stripe client is constructed, and all
provider reads use zero automatic retries and a 10-second timeout:

```bash
STRIPE_SECRET_KEY=rk_test_... node scripts/seed-stripe.mjs \
  --dry-run --require-test-mode --plan-file .tmp/stripe-catalog-plan.json
```

The full-validation candidate workflow runs this preflight before any staging
mutation. It records only the source SHA, test account mode, provider snapshot
hash, plan hash, fixed monthly amounts, and an operation summary in the
candidate manifest; the raw secret is never written to the plan or evidence.

Review the plan and its `providerSnapshotSha256`, `operations`, and fixed
amounts. Apply only the reviewed file, with the exact hash copied from its
`planSha256` field:

```bash
STRIPE_SECRET_KEY=rk_test_... yarn stripe:catalog:apply -- \
  --plan-file .tmp/stripe-catalog-plan.json \
  --confirm-sha256 <planSha256>
```

If the read-only snapshot contains more than one active product with the same
`plan_id`, plan generation fails closed and prints every conflicting product
ID. Resolve the ambiguity explicitly when regenerating the plan by repeating
`--canonical-product` as needed:

```bash
STRIPE_SECRET_KEY=rk_test_... yarn stripe:catalog:plan -- \
  --canonical-product growth=prod_... \
  --canonical-product managed=prod_...
```

Each override must name a supported plan and an active product whose
`metadata.plan_id` matches exactly. The signed plan records its resolved
`canonicalProductIds` selection. For every non-canonical duplicate, the plan
deactivates all active recurring prices and archives the product, each guarded
by the reviewed provider snapshot. There is no automatic first-product
selection, and duplicate overrides are rejected.

For an existing canonical product, monthly and annual base prices are resolved
with the same contract used by the Better Auth Stripe loader: explicit product
metadata IDs first, then an unambiguous `lookup_key`, then a single remaining
candidate. The configured `seat_price_id` is never selected or deactivated as a
base price. The monthly base must already be the fixed USD amount for its plan;
an amount mismatch fails closed. Annual pricing is optional: an absent annual
price remains absent, while an ambiguous annual set fails closed. The plan
snapshot includes each price's `lookup_key` and normalized metadata, so these
selection inputs are covered by the review hash. On the selected product only
non-canonical base-price candidates are deactivated.

Apply is refused unless the key is test mode (`sk_test_` or `rk_test_`), the
plan hash is intact, the confirmation matches exactly, the plan is test-mode,
local image files still match their planned hashes, and the provider snapshot
is unchanged. Any failed precondition performs zero mutations. Use a restricted
test-mode key with only the catalog/file permissions required for this task;
never place a key in a plan file or commit it.

There is no live-mode apply path. A live key may be used for read-only planning,
but a plan generated from live state cannot be applied by this command.
