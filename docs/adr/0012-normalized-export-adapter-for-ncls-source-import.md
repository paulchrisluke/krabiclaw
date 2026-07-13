# Use a Normalized Export Adapter for NCLS Source Import

The React/Next repository is the reference source for NCLS behavior, content, assets, and design, but KrabiClaw should not depend on that repository at runtime or during apply. The NCLS adapter will read the source tenant config, articles, assets, and route information into normalized KrabiClaw client-import manifests, then use the normal review, approval, and hash-gated apply path.

Each parity cycle pins an explicit source commit in the import evidence instead of following the repository's moving default branch. For the Blawby style-parity cycle, the baseline is `f9470f44e15f98978b7f866da54782a6da95818d` (bumped 2026-07-13 for the $80 consultation fee and phone number corrections); later source changes require an intentional adapter refresh. Automated desktop/mobile screenshot capture against this pin was removed from CI per the update in ADR 0009 — visual review is now manual.

## Considered Options

- Normalized export adapter: reviewable, replayable, and keeps the old repo as a source artifact.
- Direct source parsing during apply: fewer files, but couples production import to the old repo shape.
- Manual curated fixture: fast, but risks missing parity and bypasses the approved client import process.
