# Database epoch 5 messaging cutover

**Status: Preparation only; staging and production deployment blocked until new resource IDs are committed**
**Issue:** #820

Epoch 5 removes the superseded guest-thread command, outbox, cursor, event, and transport-notification models. It begins from `migrations/0000_epoch_5_baseline.sql`. Never apply that baseline to an Epoch 4 resource.

This change prepares the generated baseline, transformer, verifier, Worker bindings, and Durable Object class deletion. It does not authorize provisioning, data export, import, binding cutover, deployment, or live provider sends.

`scripts/check-database-epoch-binding.mjs` runs before staging and production deployment. It rejects the Epoch 4 resource names and IDs. `scripts/check-remote-database-epoch.mjs` then requires the canonical Epoch 5 messaging shape and imported site data. An authorized cutover commit must bind each environment to its verified Epoch 5 database before branch-driven deployment can proceed.

## Data contract

All non-messaging application tables are copied byte-for-byte at the logical row level. The transformer intentionally does not backfill these Epoch 4 tables:

- `guest_threads`
- `guest_thread_entries`
- `guest_thread_deliveries`
- `notifications`
- `notification_reads`

The following superseded tables do not exist in Epoch 5:

- `guest_thread_commands`
- `guest_thread_member_state`
- `guest_thread_outbox`
- `guest_thread_sequence_counters`
- `notification_deliveries`
- `notification_events`

Source reservation, experience-booking, and contact rows remain authoritative. New guest activity creates canonical threads and notifications through the Epoch 5 runtime. Historical inbox and notification rows are intentionally absent, as approved in issue #820.

## Repeatable local proof

Use an Epoch 4 export or SQLite database as the source. The target path must not exist.

```sh
yarn lint:migrations
yarn lint:schema-drift
yarn test:migrations
yarn db:epoch5:transform /absolute/path/epoch4.sqlite /absolute/path/epoch5.sqlite
yarn db:epoch5:verify /absolute/path/epoch4.sqlite /absolute/path/epoch5.sqlite
```

The transformer applies the generated Epoch 5 baseline to a new SQLite file. It rejects an unexpected table or column change, copies every non-messaging table, verifies typed logical hashes and row counts, and runs `PRAGMA foreign_key_check` and `PRAGMA integrity_check`. It refuses to overwrite an existing target.

The manifest records the count of discarded messaging rows so the deliberate no-backfill boundary is auditable.

Create a data-only import payload from the transformed database. Do not import its schema or `d1_migrations` rows:

```sh
sqlite3 /absolute/path/epoch5.sqlite '.dump --data-only --nosys --newlines' > /absolute/path/epoch5-data-body.sql
```

Wrap the payload with `PRAGMA foreign_keys = OFF;` before the first statement and `PRAGMA foreign_keys = ON;` after the last statement. The target must already contain the generated baseline. The disabled foreign-key window is limited to this empty-candidate bulk import, and the saved D1 bookmark is the rollback point for a failed import.

## Preview

Preview is disposable and resets in place through the existing command:

```sh
yarn db:reset:preview
```

Do not provision a replacement preview database or edit migration history by hand.

## Staging and production

Provisioning and cutover require direct release-owner authorization for Epoch 5. First provision fresh APAC staging and production D1 resources, record their names and IDs, and apply `migrations/0000_epoch_5_baseline.sql` through Wrangler. Export each baselined candidate and run `yarn db:epoch5:assert-empty /absolute/path/candidate-export.sql`. Stop if any application row exists.

For staging:

1. Complete the Queue retirement prechecks below.
2. Deploy the exact candidate against Epoch 4 with `DB_WRITE_FROZEN = "true"`, recheck both queues, and update the Email Routing rule as described below.
3. Wait at least 60 seconds, export Epoch 4, transform it locally, and run the verifier.
4. Create the data-only SQL payload and import it into the empty Epoch 5 resource with `wrangler d1 execute <epoch5-database-name> --remote --file /absolute/path/epoch5-data.sql`.
5. Re-export Epoch 5 and run `yarn db:epoch5:verify` against the same authoritative Epoch 4 export.
6. Commit the verified staging Epoch 5 database name and ID to `wrangler.toml`, then run `node scripts/check-database-epoch-binding.mjs staging`.
7. Merge to `staging`. The branch-driven deployment removes the freeze and binds Epoch 5. Complete read-only dashboard and tenant verification.

For production:

1. Repeat the Queue retirement prechecks against the production queues and confirm the production Epoch 5 candidate is still empty.
2. Deploy the exact candidate against Epoch 4 with `DB_WRITE_FROZEN = "true"`, recheck both queues, and update the Email Routing rule as described below.
3. Wait at least 60 seconds, take the final Epoch 4 export, transform it, and verify it.
4. Import only the data payload into the empty Epoch 5 resource, re-export it, and verify it against the final Epoch 4 export.
5. Commit the verified production Epoch 5 database name and ID to the staging-to-main release branch, then run `node scripts/check-database-epoch-binding.mjs production`.
6. Merge to `main`. The ordinary production deployment removes the freeze and binds Epoch 5.

Retain the Epoch 4 production resource for rollback. If the cutover cannot finish promptly, restore the prior Worker deployment instead of altering either database manually.

### Queue retirement gate

The prior Worker can still enqueue guest deliveries until the maintenance deployment begins. Inspect the primary queue, its dead-letter queue, and the attached consumer before removing the binding:

```sh
yarn wrangler queues info krabiclaw-guest-delivery-staging
yarn wrangler queues info krabiclaw-guest-delivery-staging-dlq
yarn wrangler queues consumer list krabiclaw-guest-delivery-staging --json
```

Use `krabiclaw-guest-delivery` and `krabiclaw-guest-delivery-dlq` for production. Require both backlog counts to be zero twice, at least 60 seconds apart. Immediately after the frozen candidate deployment, check both queues again. If either contains a message, restore the prior Worker deployment, let its consumer drain the backlog, and restart the gate. Do not detach the consumer or continue the database export with a queued or dead-lettered delivery.

After the ordinary Epoch 5 deployment, verify that the old Worker consumer is absent with `wrangler queues consumer list`. Retain the empty Queue resources through the database rollback window. Delete them only after the release owner closes rollback and confirms the final zero-backlog checks.

### Email Routing cutover gate

Email Routing rules are zone-managed state, not `wrangler.toml` state. Before deployment, list the zone's Email Routing rules through the Cloudflare dashboard or `GET /zones/{zone_id}/email/routing/rules`. Record the reply-address rule ID, matchers, enabled state, priority, and current Worker action. Keep the separate inbound Worker deployed for rollback.

Immediately after the frozen main Worker is deployed, update that same rule through `PUT /zones/{zone_id}/email/routing/rules/{rule_id}`. Preserve its matchers, enabled state, and priority; change only the Worker action to `krabiclaw-staging` or `krabiclaw`. Read the rule back and require the new action before continuing. The frozen main Worker fails inbound processing before reading or writing D1.

If routing validation fails, restore the recorded rule action and the prior main Worker deployment. Do not delete the separate inbound Worker until the ordinary Epoch 5 deployment is healthy and the release owner closes the rollback window. A live reply test writes guest data and requires an explicitly authorized canary identity; configuration inspection alone does not prove message delivery.

## Post-cutover verification

Verify:

- all retained table hashes and counts;
- empty foreign-key checks;
- a new contact submission and restaurant reservation in disposable preview;
- immediate reservation confirmation;
- one dashboard notification with per-user acknowledgement;
- owner and guest delivery receipts;
- inbound email through the main Worker;
- WhatsApp quoted-reply correlation through `guest_thread_deliveries`;
- organization-scoped WebSocket invalidation and its visible disconnected state.
