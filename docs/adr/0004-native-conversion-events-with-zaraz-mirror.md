# Native Conversion Events with a Zaraz Mirror

KrabiClaw records tenant conversion events in its first-party analytics model.
Configured external analytics are an allowlisted, non-PII projection delivered
through each tenant's host-scoped Cloudflare Zaraz GA4 tool. Zaraz owns consent
and is the only third-party analytics control plane.

Native D1 reporting remains the product source of truth, so its totals may
differ from consent-filtered GA4 totals.
