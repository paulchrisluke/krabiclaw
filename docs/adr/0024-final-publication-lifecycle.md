# ADR 0024: Final publication lifecycle

Status: accepted

## Context

KrabiClaw removed revision-backed content publishing, but several surfaces continued to expose `draft`, `archived`, and unpublish states. In those paths a persisted draft was either already public on edit, permanently hidden with no supported writer, or indistinguishable from another hidden state. That produced contracts the product could not honestly fulfill.

Onboarding is different. `onboarding_drafts` is a resumable, user-private aggregate with signed preview and explicit `active`, `committing`, `committed`, and `failed` transitions. It exists before a site is created and does not represent a publication state for an existing content record.

## Decision

- Short posts and blog articles persist only as `published` or `scheduled`.
- Creating either record publishes it immediately unless a future `scheduled_for` is supplied.
- Editing published content changes the live canonical document and is presented as **Save live changes**.
- Scheduled records may be rescheduled or published immediately. Public removal is destructive delete, not archive or unpublish.
- Platform documentation has no publication status. Every persisted platform document is public and canonical in `platform_docs.body` plus `platform_content_components`.
- Platform documents never create `content_documents` rows.
- Site locales persist only as `published` or `disabled`. New non-source locales start disabled; source locales remain published.
- Facebook publication is immediate. It has no external-draft option.
- Site lifecycle values are `active`, `inactive`, or `suspended`.
- New editor content may remain in browser memory while it is composed. Conversation may also compose and review proposed content before approval. Neither is a persisted publication state.

The sole product exception is onboarding. References to onboarding drafts, signed onboarding preview, and local unsaved editor input remain valid.

## Enforcement

Runtime writers and schemas expose only the final states. D1 triggers reject legacy post and blog states because those referenced tables cannot be safely rebuilt. A migration deletes hidden records and dependent current content, rebuilds the unreferenced platform-doc and locale tables, and rejects new platform-doc content documents. The product-model guard excludes immutable migration history and the explicit onboarding boundary.

## Consequences

There is no unpublished saved copy of a post, article, platform document, page, or locale translation. Users must approve a create operation before it is persisted, and editors must warn about unsaved browser changes. Recovering deleted content requires normal backup or audit procedures rather than a hidden archive state.
