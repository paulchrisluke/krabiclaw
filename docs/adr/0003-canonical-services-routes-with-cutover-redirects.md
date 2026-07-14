# Canonical Services Routes with Cutover Redirects

Professional-service offerings should have stable KrabiClaw-native routes at `/services` and `/services/<slug>`, but real tenant migrations may have existing indexed URLs and paid-conversion paths that should not be discarded. KrabiClaw will use `/services` as the canonical offering route family while preserving valuable NCLS legacy URLs through an explicit redirect manifest and verification checks.

## Considered Options

- Canonical `/services` plus redirects: balances reusable platform routes with cutover safety.
- New KrabiClaw routes only: cleaner, but risks losing SEO and ads attribution.
- Mirror source routes exactly: safest for one tenant, but bakes source-template/NCLS structure into the platform.
