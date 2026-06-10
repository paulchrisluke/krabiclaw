# Uniform Seeding Strategy for KrabiClaw

## Summary

KrabiClaw is moving toward a single, scalable seeding and onboarding model:

- Typed TypeScript definitions are the primary authoring surface for curated fixtures and reusable templates.
- Approved JSON import manifests are the primary output and replay surface for real client onboarding.
- Generated SQL is an execution artifact, not the long-term source of truth.
- E2E tests assert behavior; fixtures and import replays provide deterministic data states for those assertions.
- The CMS and ChowBot must maintain CRUD parity for supported content domains so chat-first onboarding does not become a one-way shortcut.

This document records what the repo already does well, what PR 1 accomplished, where the current architecture is still split, and the follow-up work required to make seeding, testing, and LLM-driven onboarding uniform.

## Current State and Accomplishments

### What already exists in KrabiClaw

KrabiClaw already has a meaningful foundation for deterministic onboarding and reviewable client imports:

- `yarn client:onboard` orchestrates the approved onboarding flow.
- `scripts/client-import.mjs` supports `--dry-run`, `--approve`, and `--apply`.
- `scripts/client-verify.mjs` verifies imported sites after apply.
- `client-imports/<slug>/` stores reviewable onboarding artifacts such as manifests, SQL previews, missing-field reports, and approval metadata.
- `client-intake/<slug>.yml` already gives us a structured intake surface for new clients.

This means the repo already supports the most important operational rule: client sites should be created from real, reviewable source data rather than ad-hoc manual DB edits.

### The current split seed model

Today, KrabiClaw still uses multiple seed authoring styles at once:

- `seeds/demo.sql` is a large checked-in SQL seed for the platform demo tenant.
- `seeds/pottery-house-krabi.sql` is a large checked-in SQL seed for Pottery House.
- `seed-definitions/demo.ts` now provides typed fixture data for the generated demo experiences block.
- `scripts/generate-demo-seed.ts` turns the typed demo fixture into a generated SQL segment inside `seeds/demo.sql`.
- `client-imports/<slug>/` already acts as a structured output surface for real client onboarding.

This is an improvement over fully manual seeding, but it is still a transitional architecture. Demo, Pottery House, and future client tenants do not yet share one uniform source-of-truth contract.

### What PR 1 accomplished

PR 1 was an important first step toward the target model:

- Introduced a typed fixture definition for demo experiences in `seed-definitions/demo.ts`.
- Added a generator in `scripts/generate-demo-seed.ts` that renders the demo experiences SQL block.
- Updated `seeds/demo.sql` so the new experiences and their content are generated instead of hand-maintained.
- Expanded demo to represent a hybrid restaurant + experiences tenant, including pizza-making and dinner-style experiences.
- Updated unit tests and E2E tests to read from the typed demo fixture instead of duplicating route assumptions in test code.
- Added editable experiences-page hero fields to the content model so the demo experience page is not relying on the wrong vertical fallback copy.

PR 1 did not finish the seed system rewrite, but it established the correct direction: typed definitions first, generated SQL second.

### What is already done

The following work is already accomplished in this repo:

- deterministic client onboarding exists via `client:onboard`, `client:import`, and `client:verify`
- reviewable onboarding artifacts already exist under `client-imports/<slug>/`
- intake data already has a structured home under `client-intake/`
- demo now has a typed fixture source for experiences in `seed-definitions/demo.ts`
- part of `seeds/demo.sql` is now generated instead of entirely hand-maintained
- demo now exercises the hybrid restaurant + experiences shape
- demo fixture data is already wired into unit and E2E coverage
- the experiences page now has editable content fields instead of relying on the wrong fallback behavior

This means the repo is no longer starting from zero. The missing work is unification, generalization, and enforcement.

### Why the older template matters

The older repo at `/Users/paulchrisluke/Repos2025/react-next-marketing-site-template` validates the core pattern we want to scale in KrabiClaw:

- A typed TS seed contract defines the allowed tenant data shape.
- A central upsert script applies that object graph to the database.
- Media processing and upload are separate from content authoring.
- Article/content ingestion is handled through structured source files rather than manual DB edits.
- Seed integrity is covered by dedicated validation tests.

That project demonstrates that typed seed authoring can work in production over time. The lesson to bring into KrabiClaw is not "copy the old repo exactly," but "make typed definitions the canonical authoring layer and keep persistence formats generated."

## Problems Still To Solve

KrabiClaw still has several architecture gaps that will create brittleness if left as-is:

- Large hand-maintained SQL files are still primary fixture sources for `demo` and `pottery-house`.
- Demo, Pottery House, and future client onboarding outputs do not yet share one uniform seed-definition contract.
- Approved client import artifacts are not yet first-class replay inputs in test workflows.
- CMS and ChowBot parity is discussed as a product requirement, but not yet formalized as a tested contract.
- Some test coverage is still tenant-name-driven instead of being scenario-driven or manifest-replay-driven.
- The repo still mixes "fixture used for tests," "demo shown to users," and "client onboarding source data" concepts more than it should.

These gaps do not mean the current system is broken. They mean the current system is transitional and will become harder to scale as more clients and more test cases arrive.

## Target Source-of-Truth Model

KrabiClaw should standardize around two allowed seed sources and one execution artifact:

### 1. Curated fixtures

Curated fixtures are typed TypeScript definitions under `seed-definitions/`.

Use curated fixtures for:

- platform demo tenants
- intentionally synthetic scenario fixtures
- reusable seed builders and helpers

Rules:

- Curated fixtures are hand-authored in TS.
- Curated fixtures must be validated in tests.
- Curated fixtures may generate SQL or other apply artifacts, but generated output is not the authoring source of truth.

### 2. Real client onboarding data

Real client data lives in approved import manifests under `client-imports/<slug>/`.

Use approved import manifests for:

- onboarding real client sites from reviewed source data
- replaying real-client regressions discovered during onboarding or support
- preserving a reproducible client state without inventing hand-maintained SQL

Rules:

- Client imports are produced by `client:import --dry-run`.
- Human review remains mandatory before approval.
- `approved.json` remains the gate for any apply or replay that claims to represent a real client.
- Manifest replay is the default long-term answer for client-specific regression coverage.

Operational policy:

- approved import replay should be reserved for paid clients or clients whose onboarding state must be preserved as a support-grade regression case
- unpaid prospects, exploratory demos, and sales-stage tenants should not automatically become permanent replay fixtures
- if a non-paying tenant reveals a product-level issue, the default response is to capture that behavior as a curated typed scenario fixture unless and until the tenant becomes a paid long-term support case

### 3. Generated execution artifacts

Generated SQL remains acceptable only as an apply artifact.

Rules:

- No new tenant should be introduced via a hand-authored SQL seed file.
- Existing SQL seeds are transitional artifacts and should be replaced by generated outputs over time.
- SQL previews remain useful for review, diffing, local apply, staging apply, and deterministic CI setup.

## Test Data Policy

KrabiClaw testing should use exactly three seed data categories.

### Demo fixture

Use the demo fixture for:

- broad platform smoke coverage
- admin and editor coverage
- multi-feature tenant coverage
- hybrid cases that should be part of the product story

Demo should remain curated and typed. It is the main "show the product well" fixture, not the dumping ground for every historical client bug.

### Scenario fixtures

Use small typed scenario fixtures only when a behavior needs a minimal synthetic data state that demo should not absorb.

Examples:

- route-shape edge cases
- malformed-but-valid content relationships
- small data sets that isolate one workflow

Scenario fixtures should stay minimal and purpose-built.

### Approved import replay

Use approved import replay for real-client regressions found during onboarding or production support.

This is the default long-term replacement for turning every client into a permanent handcrafted fixture.

The rule is:

- when a client reveals a bug, preserve the reviewed import data or a derived replayable subset
- do not create a new hand-maintained tenant SQL seed by default
- only promote a client case into a shared typed fixture if it becomes a recurring product-level scenario
- reserve durable replay coverage primarily for paid or support-grade clients whose exact onboarding state is worth preserving long-term
- prefer curated typed scenario fixtures for pre-sale, unpaid, or short-lived exploratory cases

## Pottery House Classification

Pottery House should be treated as transitional canonical onboarding regression data, not as proof that every client needs its own forever-seed.

Today it is still useful because it captures concrete onboarding failures that must not recur:

- stock photos when client photos exist
- restaurant copy leaking into an experience vertical
- Saya fallback copy leaking into client pages
- wrong demo fallback contact details
- experience detail route/rendering regressions
- image serving regressions
- manual mutation outside the approved import/apply path

Long term, Pottery House should move away from being defined by a handwritten dedicated SQL seed. It should become one of:

- generated output from a typed fixture definition, if it remains a curated regression fixture
- approved import replay, if it remains primarily a real-client onboarding case

Given current business status, Pottery House should not be assumed to deserve permanent approved import replay coverage yet. Until it becomes a paid or support-grade client case, the default recommendation is to preserve its lessons as curated typed fixtures and migration tests rather than as a forever replay artifact.

## Implementation Strategy

The implementation order must serve the platform-level migration goal, not a sequence of isolated quick wins. "Demo first" means "establish the canonical architecture on the flagship fixture," then use that architecture to pull the rest of the repo back into a uniform shape.

### Phase 1: standardize authoring rules

Adopt and document these repo rules:

- `seed-definitions/*` is the canonical home for curated typed fixtures and reusable seed builders.
- `client-imports/<slug>/` is the canonical home for approved real-client onboarding artifacts.
- curated fixtures should compile into the same normalized intermediate seed shape used by import replay
- No new tenant is introduced via a hand-authored SQL seed file.
- Generated SQL or structured apply output is allowed, but only as a derived artifact.

This phase is mostly policy, tests, and migration guardrails.

### Phase 2: replace tenant-specific SQL authoring

Move current SQL-first tenants to generated or replayable sources:

- move `demo` from partially generated SQL to fully generated site seed output from typed definitions
- use `demo` to define the full canonical typed fixture contract and normalized intermediate seed shape
- migrate existing one-off tenant customizations toward that shared contract instead of treating each as a special case
- move `pottery-house` away from handwritten SQL to typed generation first, unless later business status justifies approved import replay
- keep future tenants out of `seeds/*.sql` entirely unless the file is generated

Generated outputs must support:

- local seed/apply
- staging seed/apply
- deterministic preview/test setup
- diffable review before execution

### Phase 3: make import replay a first-class test input

Add workflow support for replaying approved client imports in local and CI environments.

This should include:

- deterministic replay commands
- stable fixture/replay naming in tests
- clear separation between curated fixture tests and client replay tests

The goal is to let E2E tests assert real-client regressions without forcing every prospect or one-off onboarding case into the permanent fixture set.

### Phase 4: formalize CMS and ChowBot parity

The seed system is only clean if the editing surfaces stay in sync.

KrabiClaw should require the following:

- anything created by typed fixture generation or client import remains editable through the CMS
- anything editable through the CMS is representable in onboarding/import manifests
- ChowBot supports the same CRUD surface as the CMS for supported content domains
- parity is verified by targeted tests instead of being treated as a loose expectation

This is a separate implementation track, but it must be treated as part of the long-term seeding architecture rather than as a separate nice-to-have.

## Public Interfaces and Workflow Expectations

The target workflow standard is:

- `seed-definitions/*` holds curated TS fixtures and builders
- `client-intake/*` holds intake inputs
- `client-imports/<slug>/` holds generated and approved onboarding artifacts
- seed commands apply generated SQL or structured apply output
- onboarding continues to follow:
  - dry run
  - human review
  - approval
  - apply
  - verify

Tests should gain the ability to seed from:

- curated fixture names
- approved client import replay inputs

The repo should gradually stop assuming that "tenant name" is the same thing as "test purpose."

## Required Test Coverage

### Seed-definition integrity tests

Require tests for:

- unique slugs and route identifiers
- route parity expectations
- schema validity
- required page/content relationships
- fixture completeness for declared public routes

### Generator determinism tests

Require tests that verify:

- the same typed source input produces the same generated output
- generated artifact boundaries are stable
- generated output includes required content sections for the declared fixture

### Onboarding and import tests

Require tests for:

- approved manifest hash enforcement
- dry-run artifact completeness
- replayable import apply behavior locally and in CI

### E2E tests

Require:

- demo smoke coverage for broad product behavior
- manifest replay regression coverage for real-client bugs
- targeted CRUD parity tests between CMS and ChowBot for supported entities

### Migration tests

Require migration-safe verification while replacing legacy SQL seeds:

- generated replacement output matches expected legacy behavior before cutover
- seed command behavior remains deterministic across local, preview, and staging flows

## Assumptions and Defaults

- This document covers the broader repo state, not just PR 1.
- The preferred canonical authoring model is based on the successful pattern from the older typed-seed project: typed TypeScript definitions first.
- Curated fixtures and approved import replay should converge on a shared normalized intermediate seed shape.
- Approved import replay is the default long-term home for real-client regressions that belong to paid or support-grade clients.
- Handwritten SQL remains acceptable only as a temporary transitional artifact.
- Demo remains the primary curated platform fixture.
- Demo-first work is only complete when it establishes the reusable architecture needed to migrate the rest of the repo, not when one visible subsection is improved.
- Pottery House is useful today, but should not define the permanent long-term shape of client seeding.
- CMS and ChowBot parity is required before chat-first onboarding can be considered a complete replacement for manual CMS-driven setup.

## Follow-Up Work

## Remaining TODOs

The system is not complete until the following work is done:

## Progress Update

Completed in this refactor track so far:

- added a shared curated fixture contract under `seed-definitions/contracts.ts`
- added a compiler that normalizes curated fixtures into a shared intermediate seed bundle in `seed-definitions/compile.ts`
- migrated the demo experiences fixture onto that shared contract instead of keeping a demo-only object shape
- updated the demo SQL generator to render from compiled normalized rows instead of from ad hoc demo arrays
- added unit coverage for compiled route manifests and normalized row identity propagation
- expanded the typed fixture and generator to cover the demo site core: site metadata, `site_config`, `site_locales`, `site_domains`, and both `business_locations` now emit from the `demo_core` generated block
- `scripts/generate-demo-seed.ts` now replaces two blocks (`demo_core` and `demo_experiences`) instead of one
- `seed-definitions/generated/demo.bundle.json` now includes the expanded core shape (identity, site, siteConfig, siteLocales, siteDomains, locations)
- unit tests verify artifact determinism and the presence of all generated core SQL inserts

Still intentionally incomplete:

- `seeds/demo.sql` lines 102–409 and 449–567 remain handwritten: media assets, menus, reviews, posts, and site_content blocks
- the compiled bundle is not yet the default apply artifact for the full demo tenant
- Pottery House and other one-off tenant customizations have not yet been migrated onto the shared contract
- approved import replay still needs its own compile/replay path into the same normalized intermediate shape

### Source-of-truth unification

- expand the shared `seed-definitions/` contract beyond the demo experiences block
- define the full typed shape for curated site fixtures, not just one generated subsection
- define the shared normalized intermediate seed shape that both curated fixtures and approved import replay compile into
- make generated outputs the default apply format for curated fixtures
- stop treating handwritten tenant SQL as an acceptable authoring surface for new work

### Demo completion

- ~~site metadata, site_config, site_locales, site_domains, business_locations~~ ✓ generated via `demo_core` block
- ~~experiences block~~ ✓ generated via `demo_experiences` block
- add generation coverage for the remaining handwritten sections: media assets, menus, reviews, posts, site_content blocks
- keep demo as the broad product and admin fixture, including restaurant + experiences coverage
- preserve editable content behavior for generated demo content
- use demo completion to lock the architectural contract that later migrations must conform to

### Pottery House migration

- move Pottery House off the handwritten SQL path
- migrate Pottery House into the shared typed fixture pathway unless its business status later justifies durable approved import replay
- keep its regression assertions, but stop letting its current SQL format define the long-term architecture

### Import replay support

- define a replay path for approved client imports in local and CI test flows
- add deterministic replay commands
- make approved import replay a first-class test input for real-client regressions
- ensure replay remains gated by the approved manifest hash

### Test policy enforcement

- add more seed-definition integrity tests beyond the current demo fixture coverage
- add generator determinism tests for future generated fixture outputs
- shift tests away from tenant-name assumptions where the real purpose is scenario coverage
- add migration checks that compare generated replacements against current legacy seed behavior before cutover

### CMS and ChowBot parity

- document the supported content domains that require parity
- verify that CMS-created data is representable in onboarding/import manifests
- verify that imported or generated data remains editable through the CMS
- add targeted CRUD parity tests between CMS and ChowBot for supported entities

### Guardrails

- add repo guardrails that block new hand-authored tenant SQL from being introduced
- make the preferred seeding path obvious in docs, scripts, and command names
- keep generated seed/apply workflows deterministic across local, preview, and staging flows
- keep migration scope oriented around reducing one-off tenant customization across the repo, not around isolated one-tenant wins

## Single-PR Completion Checklist

If this strategy is being completed as one larger implementation effort instead of many small PRs, the work is only done when all of the following are true:

1. Curated fixture authoring is standardized under `seed-definitions/`.
2. Demo seeding is fully generated from typed definitions rather than partly manual SQL.
3. Pottery House is migrated off handwritten tenant SQL.
4. Approved client import replay works as a supported local and CI test input.
5. Test coverage exists for fixture integrity, generation determinism, and replay behavior.
6. CMS and ChowBot CRUD parity expectations are documented and backed by targeted tests.
7. New handwritten tenant SQL is blocked by policy and guardrails.

Until those conditions are met, treat the current system as intentionally transitional rather than complete.
