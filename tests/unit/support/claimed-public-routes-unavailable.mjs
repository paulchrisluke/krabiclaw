// `#claimed-public-routes` is emitted by the Nitro build from the resolved route
// tree, so it has no value outside a build. Handing tests an empty set instead
// would quietly answer "nothing claims this path" and let every path look
// writable — the exact silent-wrong-answer this whole change removes.
//
// Reading it throws. A unit test that needs claims builds its own set, the way
// tests/unit/tenant-page-paths.test.ts does.
const unavailable = () => {
  throw new Error(
    '#claimed-public-routes is a build artifact and is unavailable under node --test. '
    + 'Construct a claim set with claimedRoutesFromPages() instead.',
  )
}

export const CLAIMED_PUBLIC_ROUTES = new Proxy([], { get: unavailable, has: unavailable })
