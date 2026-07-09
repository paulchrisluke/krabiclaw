# Use a Normalized Export Adapter for NCLS Source Import

The React/Next repository is the reference source for NCLS behavior, content, assets, and design, but KrabiClaw should not depend on that repository at runtime or during apply. The NCLS adapter will read the source tenant config, articles, assets, and route information into normalized KrabiClaw client-import manifests, then use the normal review, approval, and hash-gated apply path.

## Considered Options

- Normalized export adapter: reviewable, replayable, and keeps the old repo as a source artifact.
- Direct source parsing during apply: fewer files, but couples production import to the old repo shape.
- Manual curated fixture: fast, but risks missing parity and bypasses the approved client import process.
