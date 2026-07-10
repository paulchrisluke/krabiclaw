# Q&A may be site or location scoped

KrabiClaw's core Q&A collection will support questions owned by either a site as a whole or one of its locations. Site-level Q&A powers tenant-wide surfaces such as the Blawby homepage, while existing location pages continue to query only questions associated with that location.

The historical `location_qa` table name may remain even though `location_id` becomes optional; avoiding a cosmetic rename keeps the migration focused on the ownership change. A separate Blawby FAQ model was rejected because it would duplicate proven ordering, moderation, dashboard, ChowBot, and MCP behavior.
