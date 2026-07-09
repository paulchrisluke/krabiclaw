# Native Conversion Events with an Allowlisted GTM Bridge

KrabiClaw needs consultation and other tenant conversion events to be measurable after migrating NCLS, including where Google Ads attribution depends on GA4/GTM behavior. KrabiClaw will record conversion events as first-party platform events, then optionally forward allowlisted event names and properties to configured GA4/GTM destinations; arbitrary `customHeadCode` is not part of this model.

## Considered Options

- Native events plus allowlisted bridge: gives KrabiClaw a canonical analytics source while preserving ads integrations safely.
- Preserve the source dataLayer contract exactly: good for one migration, but imports source-template assumptions.
- KrabiClaw-native analytics only: simplest, but may break tenant ad attribution requirements.
