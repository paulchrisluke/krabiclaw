# KrabiClaw — agent instructions

## Completion standard

Complete the requested outcome end to end.

Do not stop at code that compiles, a partial implementation, a passing unit test,
or a workaround. The affected runtime behavior must work through its real boundary.

A defect discovered while doing the work is part of the work when it:

- exists in code or data being changed;
- affects the execution path being changed;
- violates an invariant the change depends on;
- prevents correct verification of the requested outcome; or
- reveals that the proposed implementation is built on an incorrect assumption.

Fix those defects before declaring the task complete.

"Pre-existing", "unrelated to my diff", "follow-up", "flagged for later", and
"outside scope" are not valid reasons to leave broken behavior in a path the task
depends on.

Do not leave TODOs, disabled behavior, compatibility branches, temporary
workarounds, duplicated implementations, or half-completed migrations as a
substitute for finishing the work.

Do not broaden the task into unrelated cleanup that the requested outcome does
not encounter or depend on.

## Operator authority

The repository owner operates this repository and its configured infrastructure.

An explicit owner instruction authorizes the named operation and target. Do not
require repeated confirmation solely because the target is production, staging,
remote infrastructure, billing, customer data, or a deployment.

Repository rules constrain actions the agent invents or infers. They do not
silently override an explicit owner instruction for a clearly identified
operation.

If a destructive target is genuinely ambiguous, resolve it from repository or
runtime state where possible. Ask only when the target cannot be determined.

## Canonical implementation

Every concept has one canonical implementation and every value has one canonical
source.

Fix the canonical source rather than adding a second path around it.

Do not add shadow models, duplicate APIs, parallel services, compatibility
layers, alternate data sources, or silent fallback behavior when the canonical
path can be corrected.

Do not infer a target the caller did not provide merely because one candidate
looks likely.

Missing or invalid required state must fail visibly or be fixed at its source.
Do not manufacture plausible state to conceal the failure.

## Complexity

Default order:

1. delete;
2. reuse;
3. modify;
4. add.

Before adding an abstraction, find the existing implementation of the behavior.

A refactor removes the implementation it replaces in the same change. Do not
leave old and new paths operating in parallel.

Prefer fewer concepts, fewer names, fewer state representations, and fewer
execution paths.

## Database and releases

Use the repository's canonical database, migration, deployment, rollback, and
incident-recovery mechanisms.

Do not invent a parallel mechanism when an existing repository mechanism can
perform the operation.

Schema changes originate from the canonical schema and use the repository's
migration tooling.

A scoped data repair is valid when explicitly requested or when it is the
existing mechanism required to restore the requested behavior. Verify the
persisted result and the affected runtime behavior afterward.

Do not mutate data merely to hide a reproducible application defect. Fix the
application source when the source is wrong.

Authoritative operational contracts:

- `docs/operations/release-and-outage-prevention.md`
- `docs/operations/release-flow.md`

## Evidence

A claim about data comes from querying the data.

A claim about a surface comes from loading the surface.

A claim about behavior comes from exercising the behavior.

Compilation, linting, typechecking, builds, and unit tests are supporting
evidence, not substitutes for verifying the real runtime boundary.

Follow `docs/testing-strategy.md`.

Do not declare success while the affected path still contains a known failure,
even when that failure predates the current change.

## Authentication and authorization

Better Auth owns identity, sessions, OAuth state, organizations, memberships,
roles, permissions, impersonation, and Teams.

Use the documented Better Auth mechanisms and the repository's shared permission
utilities.

Do not create shadow authentication state, custom membership systems, tenant
bypasses, undocumented support principals, or parallel authorization logic.

Dashboard, MCP, WhatsApp, and other application surfaces must share the same
canonical authorization and domain behavior.

## Tenant integrity

Tenant boundaries are strict.

Render and mutate the tenant explicitly targeted by the operation.

Do not fabricate tenant content, silently substitute another tenant's data, or
use unrelated placeholder content when required tenant state is missing.

Preserve existing customer data unless the requested operation explicitly
changes it.

After a tenant write, verify the affected persisted state and customer-facing
behavior.

## Local development

Follow `docs/local-development.md`.

Use the repository's documented setup, fixtures, authentication, and local
runtime paths rather than recreating their individual steps manually.
