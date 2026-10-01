# STEP2: existing CMS/MCP writer parity

Base: [`cleanup/cms-mcp-contracts` at `6dd4ff298`](https://github.com/paulchrisluke/krabiclaw/commit/6dd4ff298fddaeead0d73a3b12f773cf80922ed2), the verified STEP1 / PR1215 head. This draft is stacked on that branch. It does not import Foundation or Payments, change the schema, merge a PR, deploy, or write remote customer data.

## Actual capability map

| Capability in the base | Result in this draft |
| --- | --- |
| Product booking config: `duration_minutes`, `default_capacity`; inline HTTP upsert/deletion | Shared `setProductBookingConfig` / `deleteProductBookingConfig` in [availability.ts](../../../server/utils/availability.ts). HTTP and MCP use these writers. `get_product.booking` already reads the defaults; its output contract now describes that existing field. |
| Weekly schedules: HTTP calls `replaceWeeklySchedule` | MCP calls the same writer. Location ownership, saved timezone and slot validation live there. Generation is scoped to the replaced location. An empty array clears only that scope, including after its duration default is cleared. |
| Authored Q&A: existing HTTP create/update/delete/reorder and content-document tree | Four MCP wrappers call [location-qa.ts](../../../server/utils/location-qa.ts). Create/update normalize once. Source `manual`, tenant and location/page scope are checked. Reorder validates every manual ID and executes one guarded UPDATE; mixed imported/out-of-scope input changes no Q&A row. |
| Page edits: existing `updateTenantPage` / `TenantPageEditorInput` have no `productId` binding input or binding safeguards | Excluded. The existing `content_documents.product_id` column is retained, as are rich service pages. Forwarding a new binding would require implementing the missing Foundation behavior, rather than exposing an existing writer. |
| Consultation: public reader and organization seed; modes `external_url` / `native_disabled` | Excluded. There is no editable consultation getter/setter in this base. No native consultation behavior or future mode is invented. |
| Booking policy fields beyond duration/capacity | Excluded: this base's product config does not contain them. Restaurant reservations remain separate. |

## Shared contract

Booking config omission retains a stored default; explicit null clears it, and capacity zero remains zero. An empty patch still enables the existing capability with null defaults on a new config. Deletion is refused for **any** booking history, including cancelled history, and the DELETE repeats that predicate atomically. Product identity is checked through the existing organization/publication helper. Existing HTTP response shapes remain unchanged.

Weekly replacement retains the existing rule/occurrence identities and booked sessions. Removed future unbooked sessions are cancelled; other locations' rules and sessions are untouched. The review found that the original writer invoked all-product materialization: an incomplete rule at another location could cause a clear to fail after its writes committed. The canonical materializer now accepts an optional location filter; replacement supplies its scope. Other existing all-product generation callers retain their behavior. DST gap/fold behavior remains the existing explicit skip reporting.

Q&A retains English root documents, localized representations, content-document deletion, and cache invalidation. Imported records use source `import` in this schema; every nonmanual root is protected. Answer/author trimming remains unchanged. Questions are validated after trimming, with the same 500-character limit for create and update. Integer sort positions and boolean owner-answer flags are checked in the shared writer; transport coercion/truncation was removed. Omitted location sort order now uses the existing shared append behavior rather than forcing zero. The location reorder route delegates its array validation to the same existing multi-record writer as organization Q&A.

All seven MCP additions retain the existing admin/owner authorization floor and tenant membership boundary. Replacement/update/delete annotations describe write effects; config/Q&A deletion requires confirmation. Q&A create explicitly creates a fresh ID on every call and does not promise safe automatic retry. No idempotency table was added. Existing clients and read tools are retained.

## Verification

- Focused real D1: 11 tests passed across `availability-d1.test.ts` and `location-qa-media-metadata-d1.test.ts`. Covers omission/zero/null, cancelled-history deletion refusal, canonical timezone/foreign-location denial, convergence, other-location preservation, clearing with null duration, booked session identity, DST gaps/folds, imported/mixed reorder atomicity, normalization, scope protection, preserved translations and complete authored-tree deletion.
- Focused unit/annotation checks: 3 additional tests passed (`availability-settings.test.ts`, `mcp-tool-annotations.test.ts`).
- Production Worker/browser: six checks passed, including HTTP→MCP and MCP→HTTP persisted readback for defaults and Q&A, schedule replacement/readback/clear, wrong-scope denial, existing review protection, Pottery/Saya booking, Kikuzuki restaurant reservation, and Blawby home/service rendering. Three focused MCP/authorization checks passed against the scoped-generation build. The final malformed-scope adjustment passed the affected parity test; unchanged guest integration checks were not repeatedly rerun.
- Typecheck, lint, production build/unsupported-import guard and MCP catalog check passed. Catalog and ChatGPT submission metadata were regenerated.
- One focused manual review checked authorization, SQL mutation predicates, omission semantics, atomicity, localization/cache propagation and the exact final diff. It found and fixed the cross-location materialization defect described above. It also ensured malformed MCP scope values reach shared validation rather than becoming general-site scope. No separate full-suite or repeated external review rounds were run.

The final diff contains no schema/migration, financial snapshot, seller/catalog mapping, billing/customer identity, paused branch, provider assignment or pricing gate changes. Product → Variant → Price → Session → Booking, separate restaurant Reservations, and the shared allocator/controller remain. Scheduling ownership and the Foundation-only gaps stay with the next root-owned step.

## Independent review correction

Independent review found the three new booking-writer import names accidentally copied into three existing `assert.rejects` calls in the availability test. Runtime tests passed without detecting those malformed argument lists; the normal Nuxt typecheck explicitly excludes tests. The extra arguments were removed, and all seven availability D1 tests passed again. Targeted ESLint passed for all three changed test files. Direct TypeScript diagnostics are clean for the availability test and MCP browser spec. A broader direct scan reports four existing Q&A route-fixture typing diagnostics (partial auth bindings, missing typed runtime context, and two untyped JSON reads); it is not claimed as a passing typecheck for that fixture. The remaining diff was inspected for duplicate/copy artifacts; the three import names occur only in their import block and intended calls. This correction changes tests and evidence only; base, schema and runtime implementation are unchanged.
