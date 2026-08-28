# Native Conversion Events with an Allowlisted Zaraz Mirror

KrabiClaw records consultation and other tenant conversion events in its first-party analytics model. Optional external analytics are an allowlisted mirror through the tenant's host-scoped Cloudflare Zaraz GA4 tool. Zaraz is the only consent owner and third-party analytics control plane; templates do not inject GTM, push to `dataLayer`, or carry custom analytics metadata.

The mirror uses the canonical conversion event name and only the approved non-PII projection. Native D1 reporting remains the product source of truth, so its totals may differ from consent-filtered GA4 totals.

## Considered Options

- Native events plus an allowlisted Zaraz mirror: keeps D1 canonical while preserving consent-gated ads integrations through one control plane.
- Preserve a source GTM/dataLayer contract: rejected because it imports template-specific scripts, consent state, and event metadata.
- KrabiClaw-native analytics only: simplest, but may break tenant ad attribution requirements.
