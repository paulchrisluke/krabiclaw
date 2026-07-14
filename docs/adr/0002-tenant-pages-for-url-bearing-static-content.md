# Use Tenant Pages for URL-Bearing Static Content

Tenant legal, compliance, and static informational pages need their own public URLs, SEO metadata, robots/canonical behavior, and publication state. KrabiClaw will model these as tenant pages rather than storing them as `site_content` field rows or pretending they are tenant articles; `blog_posts` remains the article model, and `site_content` remains for small reusable fields.

## Considered Options

- New `tenant_pages`: explicit route and page semantics for privacy, disclaimers, terms, notices, and similar pages.
- `site_content`: useful for snippets, but too loose for URL-bearing pages.
- `blog_posts`: already has SEO fields, but blurs article and compliance content.
