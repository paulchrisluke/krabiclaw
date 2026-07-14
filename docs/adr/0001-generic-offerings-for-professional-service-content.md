# Use Generic Offerings for Professional-Service Content

Professional-service tenants need durable public content for services, practice areas, and similar expertise-led pages, but this content should not inherit restaurant menu semantics or bookable experience semantics. KrabiClaw will model these as generic offerings and let templates/API surfaces label them in tenant-appropriate language, such as "Practice Areas" for legal tenants.

## Considered Options

- Generic `offerings`: reusable across legal and adjacent professional-service tenants.
- Dedicated `practice_areas`: clearer for legal but too narrow for reusable professional-service content.
- Reuse `experiences`: faster, but carries booking/activity fields and violates the platform boundary.

## Decision

Use generic `offerings` as the professional-service content model. Templates and API surfaces label offerings in tenant-appropriate language, such as "Practice Areas" for legal tenants.
