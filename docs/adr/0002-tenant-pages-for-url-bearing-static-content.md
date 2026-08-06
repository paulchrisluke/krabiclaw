# Use Tenant Pages for URL-Bearing Static Content

Tenant legal, compliance, and static informational pages need their own public URLs, SEO metadata, robots/canonical behavior, and publication state. KrabiClaw models these as canonical tenant pages rather than field rows or tenant articles; `blog_posts` remains the article model and blocks own page composition.

## Considered Options

- New `tenant_pages`: explicit route and page semantics for privacy, disclaimers, terms, notices, and similar pages.
- Reusable site configuration or structured domain tables: appropriate for non-page data, not URL-bearing page composition.
- `blog_posts`: already has SEO fields, but blurs article and compliance content.
