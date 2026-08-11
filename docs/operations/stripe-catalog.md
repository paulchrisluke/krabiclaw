# Stripe catalog operator plan

`scripts/seed-stripe.mjs` reconciles the new-sale recurring catalog for Starter
(free, with no Stripe product) and Growth (`$49` per month or `$588` per year). Managed (`$149`)
and SEO Accelerator (`$349`) are retired from new offers. Every product and
price, including already-archived products and inactive or one-time prices, is
read into the reviewed snapshot. Only products whose metadata explicitly names
`plan_id=managed|seo_accelerator` or `addon_type=translation|seasonal|gbp_setup`
are retired; unknown products are never classified by name. For each still-active
retired product whose default price is active, the plan first clears that exact
default price, then deactivates every independently active price before archiving
the product, including duplicates. Inactive products are never cleared or
archived. Retired products are never created, updated, or marketed, and an absent retired product
produces no operation. Retired plan
identities are not valid runtime entitlements; the runtime sale model accepts
only Starter and Growth. Historical fulfillment rows remain raw read-only audit
history, while archiving a product or price prevents new purchases.

The script does not create one-time credit, add-on, or auto-top-up products, and
it never changes a price amount.

The default mode is read-only. It proves the exact Stripe account, lists every
product and all of its active and inactive prices, writes no product/price/file
mutations, and emits a deterministic JSON plan with a SHA-256 hash. The full
`pricesByProduct` snapshot is included in `providerSnapshotSha256`, so expected
price state is covered by the signed plan and every destructive precondition:

```bash
STRIPE_SECRET_KEY=rk_test_... yarn stripe:catalog:plan \
  > .tmp/stripe-catalog-plan.json
```

When the reviewed change is limited to retiring unused catalog families, use
the signed retirement-only scope. It requires exactly one active canonical
Growth product with an active USD 49 monthly price and, when an annual price is
present, an exact USD 588 annual price, but emits no Growth product,
price, or image operation and does not require the local Growth image:

```bash
STRIPE_SECRET_KEY=rk_test_... yarn stripe:catalog:plan -- \
  --retirement-only --plan-file .tmp/stripe-retirement-plan.json
```

The scope is part of the plan schema and SHA. Missing or ambiguous Growth
identity, a wrong monthly amount, or any other Growth safety drift fails closed;
the plan then contains only metadata-classified retirement operations.

Release preflight runs the same read-only planner with an explicit test-mode
guard. The guard is checked before the Stripe client is constructed, and all
provider reads use zero automatic retries and a 10-second timeout. Plan
generation also fails if the required local Growth product image is absent:

```bash
STRIPE_SECRET_KEY=rk_test_... node scripts/seed-stripe.mjs \
  --dry-run --require-test-mode --plan-file .tmp/stripe-catalog-plan.json
```

Catalog reconciliation is an explicit operator workflow and is not coupled to
application deployment. Staging releases verify the configured webhook and a
real test-mode checkout journey, while catalog drift is planned, reviewed, and
applied separately with the commands below. This prevents unrelated product
metadata copy from blocking an application or incident release.

Review the plan and its `providerSnapshotSha256`, `operations`, and fixed
amounts. Apply only the reviewed file, with the exact hash copied from its
`planSha256` field:

```bash
STRIPE_SECRET_KEY=rk_test_... yarn stripe:catalog:apply -- \
  --plan-file .tmp/stripe-catalog-plan.json \
  --confirm-sha256 <planSha256> \
  --journal-file .tmp/stripe-catalog-apply.json
```

`--journal-file` is mandatory for every apply. The operator writes the journal
atomically before the first provider mutation. It is keyed to the exact plan
SHA, provider snapshot SHA, Stripe account ID, and test account mode; reusing
the path for any other plan, snapshot, account, or mode is refused. Each operation is recorded as
`pending`, `running`, `applied`, or `failed` with only sanitized IDs/URLs and
error evidence. A failed apply exits non-zero with `status=incomplete`; review
the journal and resume the same signed plan only after the named action is
safe. The journal never claims compensation or completion when a provider
mutation may have succeeded without a durable result.

The signed operation order creates or reconciles the canonical Growth product,
required monthly price, any unambiguous existing annual price, and image first.
For active retired products, it clears a signed active default price before
deactivating prices and archiving the product. The planner never invents an
annual amount when no annual price exists. The operator re-reads the provider
and proves that no canonical operation remains before each deactivation or
archival mutation. Every operation re-checks its
reviewed provider precondition, and already-applied operations are skipped only
when the provider state matches the journal evidence. On completion, a fresh
provider snapshot must produce zero remaining operations against the same desired model;
otherwise the journal remains `incomplete` and a new reviewed plan is required.

If the read-only snapshot contains more than one active Growth product, plan
generation fails closed and prints every conflicting product ID. Resolve the
ambiguity explicitly when regenerating the plan with a Growth-only override:

```bash
STRIPE_SECRET_KEY=rk_test_... yarn stripe:catalog:plan -- \
  --canonical-product growth=prod_...
```

The override must name Growth and an active product whose `metadata.plan_id`
matches exactly; retired Managed/SEO overrides are rejected. The signed plan
records its resolved `canonicalProductIds` selection. For every non-canonical
Growth duplicate, and for every active retired product, the plan deactivates
all active prices (recurring or one-time) and archives the product, each guarded by the
reviewed provider snapshot. An active retired default price is cleared first;
the canonical Growth product and inactive products are not cleared. There is no
automatic first-product selection.

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
plan hash is intact, the confirmation matches exactly, the plan is test-mode
and bound to the current exact Stripe account, local image files still match
their planned hashes, and the provider snapshot is unchanged when a new
journal starts. During resume, each pending operation revalidates its signed
target and canonical safety boundary against a fresh snapshot. A failed
operation performs no mutation from that operation; earlier journaled
operations remain applied and are reported as such. Use a restricted
test-mode key with read-account plus the catalog/file permissions required for
this task;
never place a key in a plan file or commit it.

There is no live-mode apply path. A live key may be used for read-only planning,
but a plan generated from live state cannot be applied by this command.
