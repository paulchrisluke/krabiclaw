# Session authority and deletion inventory — Step 3

Stack: `cleanup/session-authority` on accepted Step 2 `941ff7c77637902bad42a4bf00b2f275de0c323f` (PR1216), which stacks on Step 1 PR1215. No schema, migration, production/customer-row deletion, provider, billing gate, Payments, Calendar, or Foundation branch import.

## Reproduced defect and bounded correction

The actual D1 reproduction books six of ten seats, clears the weekly slot, changes defaults from 120 minutes/10 seats to 30 minutes/2 seats, and re-adds the same wall-clock slot. Before the fix, detached-session adoption changed the saved capacity to 2 and shortened its end time despite six booked seats; it also replaced occurrence provenance. Cancelled Booking history exposed a second defect: clearing the rule cancelled its scheduled Session.

`server/utils/availability.ts` now guards both location-scoped and location-neutral adoption inside the UPSERT with an organization-scoped absence-of-any-Booking predicate. Rule removal cancels only Sessions without any Booking history. It still detaches deleted-rule provenance; it retains Session ID, source occurrence identity, actual UTC times, timezone, capacity, status, and Booking links. Cancelled Bookings count as history. A cancelled historical Session is not resurrected. Edited or moved historical Sessions retain their actual facts. A moved Session can coexist with a newly generated occurrence at the original wall-clock time; the moved row is not rewritten.

Ownership: Product duration/capacity are authoring defaults for new occurrences; rules describe recurrence; saved Sessions own actual facts. The editor and MCP descriptions now say this explicitly. Separate restaurant Reservations and their allocator are unchanged.

Unbooked clear/re-add behavior remains: cancelled detached generated Sessions may reopen and receive current defaults, retaining their ID. There is no saved baseline/edit marker sufficient to distinguish all unbooked capacity/end-time edits after the old rule is deleted. Preserving those edits on re-add would require a separate behavior decision; this PR does not invent one. Normal replay retains existing occurrence facts. Future Payments holds require their own history guard when that work is integrated; no hold table exists in this base.

## Read-only saved-production inventory

Provenance: canonical production snapshot retained from successful Step 1 local preparation, exported at 2026-10-01 11:21 UTC from the existing `krabiclaw-production-v7` binding; queried through SQLite `mode=ro`, before subsequent disposable local Worker test writes. Source SQL SHA256: `ba0529d904c46cf30aeee79613d91436edb7fdf76de69cdb6516a0dffb972fe6`. This is timestamped snapshot evidence, not a fresh claim about every environment. No customer identifiers, booking payloads, or tool arguments are included.

| Candidate / observation | Snapshot result | Recommendation |
| --- | ---: | --- |
| Rule `end_time` / `interval_minutes` | 0 non-null pairs; no runtime reader/writer outside schema | Strongest removal candidate after fresh all-environment null checks; retain neither merely because columns exist. |
| Rule `interval_weeks` | 131 rules, all weekly/1 | Simplify recurrence authoring to weekly weekday/time. |
| Rule effective start/end windows | 0 populated | Remove unused window layer after fresh checks. |
| Rule duration/capacity overrides | 0 populated, 0 resolved divergence from Product defaults | Remove override layer after fresh checks; capacity currently has CMS/MCP authoring and synthetic tests, so remove those contracts together rather than silently ignore inputs. |
| Product booking defaults | 11 configs; 10 duration and capacity values set, one null; no zero capacities | Keep provisionally as the one existing authoring input, not as proof of a necessary abstraction. |
| Configured product activity | 9 products with rules/Sessions; 2 products with Booking history | Actual history is sparse; configured presence alone does not establish organic demand. |
| Sessions | 960, all scheduled; 0 detached/one-off/cancelled; 0 current resolved duration/capacity divergence or moved local-start divergence | Do not infer nobody ever edited from equality; no edit marker establishes that. |
| Booking links | 3 rows: 2 confirmed, 1 cancelled; 3 distinct Sessions; 0 missing or cross-scope links | Preserve saved Session facts and historical links. |

Rules span three organizations and nine products. All 11 configured products have `manual` source, which does not distinguish manual owner input from seeded/template fixtures. All are published/offered. Duration values: null×1, 90×1, 105×1, 120×1, 150×7. Capacity values: null×1, 4×1, 6×2, 8×3, 10×1, 12×1, 16×1, 20×1. Existing MCP telemetry has policy tools, but no schedule/default writer calls; the new Step 2 wrappers are unmerged, so absence is not evidence of rejection by users. Synthetic integration fixtures exercise overrides, cadence, and windows; they are not production-use evidence.

## Concrete later simplification and lossless mapping

Recommend one authoring layer: Product duration/capacity plus weekly rule weekday, wall time, location and timezone. Delete the unused pair, windows, multiweek cadence and per-rule override contracts together after fresh read-only checks of every relevant deployment and owner approval of any exposed capacity-control removal.

For the observed 131 rules, mapping is lossless: preserve rule IDs, organization/product/location, weekday, local start and timezone; weekly/1 and open bounds need no transformation; null overrides resolve to the already configured Product values. Preserve every Session and Booking row/ID/fact without regenerating or rewriting them. Remove obsolete indexes/constraints only in a later reviewed forward migration. Do not follow the stale blanket epoch-reset instruction.

If fresh checks find a populated legacy pair, non-null override, finite window, or multiweek cadence, stop that candidate and enumerate the smallest concrete mapping/owner decision. Open-ended multiweek recurrence cannot be losslessly flattened to weekly recurrence by dropping fields. Session capacity/end-time equality does not justify deleting booked factual snapshots. Unused draft payable tags remain a later owner item.

## Validation

Ten real D1 integration cases pass: existing normal replay, DST, scoped/other-location behavior, default writes, historical active/cancelled/edited/moved cases, retained unbooked re-add, location-neutral history, and concurrent claim/adoption. The race asserts either a protected six-seat claim or rejection after a two-seat adoption, never overselling. The production-build Worker test crosses CMS clear, MCP default/re-add, actual public six-seat booking, editor readback, and public remaining-seat readback.

Feature-library mapping/evidence is refreshed for the inherited Step 2 shared writers and this changed authority description; it adds no billing gate or marketing claim. Nuxt excludes tests from normal typechecking. Focused runtime test evidence is distinct from test-source typing evidence; the four pre-existing Q&A harness typing diagnostics reported in Step 2 remain out of this patch.

Final checks: production build, required `yarn quality`, MCP catalog, generated submission check, focused test lint, and focused direct TypeScript diagnostics (zero) pass. Adjacent shared CMS/MCP parity and Product/public-booking Worker cases pass. Final diff review confirms no schema or provider expansion. Independent review remains with the coordinating root; no repeated full-suite/review round was launched.
