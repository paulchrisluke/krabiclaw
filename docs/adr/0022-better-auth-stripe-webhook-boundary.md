# ADR 0022: Better Auth Stripe Webhook Boundary

## Status

Accepted for the pinned `better-auth` / `@better-auth/stripe` `1.7.0-beta.10` dependency line.

## Context

The pinned `@better-auth/stripe` build mutates subscription state inside its
`customer.subscription.*` webhook handlers before invoking the application
callback, logs lifecycle failures without propagating them, and can create a
second checkout for a `past_due` subscription. Those behaviors prevent
application event-ID deduplication and durable current-state reconciliation from
being authoritative.

## Decision

KrabiClaw applies the checked-in patch
`patches/@better-auth+stripe+1.7.0-beta.10.patch` to
`node_modules/@better-auth/stripe/dist/index.mjs`. The patch delegates
subscription lifecycle events to KrabiClaw’s reconciler, retrieves current
Stripe state, propagates lifecycle failures, and rejects past-due upgrades in
the Better Auth endpoint. `postinstall` uses `patch-package --error-on-fail` so
an unapplied patch cannot silently restore the broken behavior.

The application reconciler remains responsible for current-state repair,
monotonic event protection, projection, and retry processing. This patch is a
dependency-boundary measure, not a second billing implementation.

The application callback durably records each verified event and schedules the
same fenced processor with the request's Cloudflare `waitUntil` context. The
hourly task remains a recovery sweeper for leases, missed dispatches, and
dead-letter transitions; it is not the normal fulfillment path.

## Exit condition

Remove the patch only after an upstream Better Auth Stripe release provides the
same lifecycle ordering, error propagation, and past-due upgrade protection;
then rerun the browser billing flow and signed webhook regression suite.
