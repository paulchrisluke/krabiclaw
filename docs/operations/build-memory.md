# Production Build Memory

## Measured cause

The original failure was not a runtime memory leak. Nitro and Rollup exhausted
Node's default V8 heap while constructing the Cloudflare Worker graph when the
experimental Nitro task registry was enabled.

Measurements from the same `staging` revision on macOS arm64:

| Build | Result | Maximum RSS |
| --- | --- | ---: |
| Nitro tasks enabled, default V8 heap | OOM in Nitro/Rollup | 4.39 GB |
| Nitro tasks enabled, 6,144 MB old-space limit | Passed | 7.86 GB |
| Nitro task registry disabled, direct scheduler build | Passed | 5.62 GB |

The direct scheduler build emits no `chunks/tasks/*` files. The Worker entrypoint
dispatches the same task modules from `workers/app-entry.ts` using the
Cloudflare `scheduled()` event and lazy task loaders. The task implementations
remain in `server/tasks/` and continue to use the canonical domain utilities.

This fixes the build-graph amplification, but it does not make the task code
disappear from the upload: Wrangler inlines the task modules into the Worker
bundle. The measured dry-run upload changed from 30,166 KiB / 6,448 KiB gzip
with Nitro tasks to 34,105 KiB / 7,105 KiB gzip with the direct scheduler.
`wrangler check startup` measured about 180 ms active CPU for the old task build
and about 240 ms for the direct scheduler across three local samples. These are
local profiles, not production latency measurements.

If the larger web Worker startup profile becomes unacceptable, the next
separate change is a dedicated cron Worker or Service Binding. It should not be
reintroduced as a second scheduler inside the web Worker without measuring the
deployment and rollback surface.

## Build commands

- `yarn build` creates the complete deployable Worker with the required V8 heap.

## Scheduled-task validation

The lowest-level regression suite is:

```bash
yarn test:scheduled-tasks
```

It verifies the cron map, environment and scheduled-time propagation, sibling
failure isolation, and unknown-cron behavior. To exercise the actual Worker
entrypoint after `yarn build`:

```bash
yarn wrangler dev --local --test-scheduled --port 8788
curl 'http://127.0.0.1:8788/__scheduled?cron=%2A%2F5%20%2A%20%2A%20%2A%20%2A'
```

The endpoint should return `Ran scheduled event`. Local D1 must be migrated
and seeded before expecting data-dependent task success. Preview and staging
explicitly set `crons = []`; do not use them for scheduled-task smoke tests.
Provider delivery modes must remain `log_only` for local validation.
