# Native analytics

Insights and `get_organization_analytics` read the organization’s first-party D1
record through `getAnalyticsReport`. Traffic from social networks, search,
campaigns and direct visits shares the same reporting period and attribution
model. Provider access is not required to read that history.

`analytics_events` stores observations and business outcomes;
`analytics_summaries` stores sessions and daily summaries. The shared schema in
`shared/analytics-report.ts` defines the producer, dashboard and MCP contract.
Malformed reports fail before the dashboard endpoint sends a successful response.
Browser request failures include the endpoint, error code and request ID in the
console, and the page shows an error with a retry action instead of zero totals.

Google Analytics is a delivery destination. Recorded GA4 delivery outcomes are
reported separately from native business outcomes. Meta publishing connections
remain in Integrations; impressions and reach on those platforms are different
populations from visits to the website and are not added to website traffic.

Dates are inclusive in the organization’s timezone, defaulting to the last 30
calendar days. The dashboard offers compact 7d and 30d controls. Session
conversion rates use eligible sessions, while outcome attribution uses each
event’s immutable attribution snapshot. Amounts remain in minor units per currency;
quoted booking value is not collected revenue.
