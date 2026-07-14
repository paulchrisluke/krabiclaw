# Domain Docs

KrabiClaw is a single-context repository. Engineering skills should read the
root `CONTEXT.md` glossary and relevant decisions under `docs/adr/` before
exploring or changing a domain area.

## Use The Glossary Vocabulary

Use terms as defined in `CONTEXT.md` in issue titles, implementation plans,
hypotheses, tests, and documentation. Do not replace canonical terms with
synonyms the glossary explicitly avoids.

If a required concept is absent, reconsider whether new terminology is needed
or capture the gap for a `grill-with-docs` session.

## Respect Architectural Decisions

Read ADRs relevant to the work. If proposed work conflicts with an existing
ADR, identify that conflict explicitly instead of silently overriding it.

If `CONTEXT.md` or `docs/adr/` is absent, proceed without treating absence as an
error. Producer skills create domain documentation only when a decision or term
actually warrants it.
