# Performance recovery — 2026-07

## Before

A representative bootstrap with two locations and eight experiences performed
approximately 25 availability statements and 30 policy statements after the
main batch. The persistent public shell also requested full menu and experience
payloads, while route pages requested overlapping data. Dashboard requests
depended on a client-only global fetch mutation and could repair missing context
with additional requests.

## After

- Availability query count is four for 1, 8, or 25 experiences.
- Booking-policy query count is one per requested policy type for 1, 8, or 25
  experiences.
- The shell excludes the full menu and experience list.
- Public SSR calls the canonical service directly.
- Dashboard/CMS calls use a single scoped transport with no automatic retry.
- CI rejects global fetch mutation, non-zero retries, and direct dashboard
  `$fetch`.

The checked-in benchmark commands remain `yarn benchmark:bootstrap` and
`yarn perf:lighthouse`. Lobby and Saya must use the same seeded tenant, cold and
warm cache runs, browser, and network profile. Remaining build isolation is item
7 and is intentionally outside this implementation only after these shared
data-loading costs are normalized.

