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

Review the plan and its `providerSnapshotSha256`, `operations`, and fixed
amounts. Apply only the reviewed file, with the exact hash copied from its
`planSha256` field:

```bash
STRIPE_SECRET_KEY=rk_test_... yarn stripe:catalog:apply -- \
  --plan-file .tmp/stripe-catalog-plan.json \
  --confirm-sha256 <planSha256>
```

Apply is refused unless the key is test mode (`sk_test_` or `rk_test_`), the
plan hash is intact, the confirmation matches exactly, the plan is test-mode,
local image files still match their planned hashes, and the provider snapshot
is unchanged. Any failed precondition performs zero mutations. Use a restricted
test-mode key with only the catalog/file permissions required for this task;
never place a key in a plan file or commit it.

There is no live-mode apply path. A live key may be used for read-only planning,
but a plan generated from live state cannot be applied by this command.
