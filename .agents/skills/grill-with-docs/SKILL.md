---
name: grill-with-docs
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions.
---

<what-to-do>

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.

If a question can be answered by exploring the codebase, explore the codebase instead.

</what-to-do>

<supporting-info>

## Overview

A grill session has three phases — setup, an interview loop with mandatory checkpointing, and a close-out that produces docs and (optionally) a PRD. Inline updates to `CONTEXT.md` / ADRs happen throughout, not at the end.

### Lifecycle

1. **Setup** — create the session folder + `notes.md`, tell the user the path.
2. **Interview loop** (repeat until done) — ask one question → record the answer → checkpoint: append to `notes.md`, update `CONTEXT.md` if a term resolved, write an ADR if the decision is hard-to-reverse + surprising + a real trade-off → next question.
3. **End** — reconcile `notes.md` against CONTEXT.md / ADRs; if feature-shaped, produce a PRD and route it via `docs/agents/issue-tracker.md`; link the PRD location back into `notes.md`; recommend `/to-issues`.

### Where things land

For grill-originated features, the grill session folder IS the feature folder for the local-markdown tracker — PRD, implementation issues, mockups, and notes all live together under one session folder, each artifact type in its own subfolder.

```
<project-root>/
├── .scratch/
│   └── grill-with-docs/                              ← one subfolder per grill session
│       ├── 2026-06-06-checkout-flow/                 ← visual session that became a feature
│       │   ├── notes.md                              ← raw Q&A audit trail (always)
│       │   ├── prd.md                                ← PRD (written by grill close-out, local tracker only)
│       │   ├── designs/                              ← lazy, only for frontend/UI sessions
│       │   │   ├── layout.html
│       │   │   ├── layout-v2.html
│       │   │   └── nav.html
│       │   └── issues/                               ← lazy, written by /to-issues
│       │       ├── 01-cart.md
│       │       └── 02-checkout.md
│       └── 2026-06-07-domain-glossary/               ← non-visual, terminology-only session
│           └── notes.md                              ← no designs/, no prd.md, no issues/ (not feature-shaped)
├── CONTEXT.md                                        ← glossary; updated inline (single-context repos)
├── docs/
│   ├── adr/NNNN-<slug>.md                            ← ADRs (lazy, written when a decision warrants one)
│   └── agents/issue-tracker.md                       ← read at end-of-session to pick PRD destination
```

Multi-context repos (`CONTEXT-MAP.md` at the root) put `CONTEXT.md` and `docs/adr/` under each context's own folder instead of at the project root.

GitHub-tracker projects publish the PRD as a GitHub issue and implementation tickets as GitHub issues — so `prd.md` and the `issues/` subfolder are not written locally. The session folder still holds `notes.md` (with links to the GitHub URLs) and any `designs/`. The `prd.md` and `issues/` artifacts only appear when the tracker is local-markdown.

## Setup (do this BEFORE the first question)

1. **Each grilling session gets its own folder under `<project-root>/.scratch/grill-with-docs/{YYYY-MM-DD}-{topic-slug}/`.** Inside that folder, the markdown capture file is always `notes.md` — the raw Q&A audit trail. So the full path is `<project-root>/.scratch/grill-with-docs/{YYYY-MM-DD}-{topic-slug}/notes.md`.
   - **Always anchor paths to the project root**, not the current working directory. Find the root with `git rev-parse --show-toplevel` (or fall back to the highest folder containing a project marker like `package.json`, `pyproject.toml`, `Cargo.toml`, `.git/`, etc. if not in a git repo).
   - Create the session folder if it doesn't exist. Polished outputs (CONTEXT.md updates, ADRs) land in their own files outside the session folder — the capture file is the raw audit trail.
   - Get today's date with `date +%F` (Bash) if you don't already know it.
   - Note: `.scratch/` is also used by the local-markdown issue tracker convention, where features-not-from-a-grill live at `.scratch/<feature-slug>/`. The `grill-with-docs/` namespace is distinct enough that it won't collide with feature slugs. **Only when the project's tracker is local-markdown** (set via `/setup-skills` and recorded in `docs/agents/issue-tracker.md`) does the grill session folder also double as the feature folder — the PRD lives at `prd.md` (root of the session folder) and `/to-issues` outputs land in an `issues/` subfolder as `01-<slug>.md`, `02-<slug>.md`, …, inside the grill session folder rather than in a separate `.scratch/<feature-slug>/`. For GitHub or GitLab trackers, the PRD and implementation issues live on the remote tracker — the grill folder only holds `notes.md` (with links to those URLs) and any `designs/`.
   - A sibling `designs/` subfolder inside the session folder (`<project-root>/.scratch/grill-with-docs/{YYYY-MM-DD}-{topic-slug}/designs/`) is reserved for HTML visual mockups only — never write markdown there. It's created lazily by the visual companion (see below), and only when the session actually has frontend/UI/visual decisions to make.
2. **Create the capture file immediately** with a header: title, date, the goal of the session, and an empty "Open flags" section.
3. **Tell the user where you're saving**, in one line. Then ask Q1.

## The checkpoint rule (non-negotiable)

After EVERY user answer, BEFORE you ask the next question:
- Append a structured entry to the capture file: the question topic, the key facts and decisions from their answer (in their words where the wording matters), and any flags (things they couldn't answer plus who should).
- If the answer resolved a term, also update `CONTEXT.md` inline (see below). If it produced an ADR-worthy decision, write the ADR. The brainstorm file still gets the raw entry — CONTEXT.md/ADRs are distilled outputs, not replacements for the log.
- Update or correct earlier entries if a later answer changes them.
- Only then ask the next question.

Never batch multiple answers into one write. Checkpoint one answer at a time.

## Interview method

- Ask **one question at a time**. For each, provide your **recommended answer** (your best inference from context, code, CONTEXT.md, and existing ADRs) so the user can simply confirm, correct, or redirect.
- **Use the `AskUserQuestion` tool** whenever a question has identifiable options or trade-offs to choose between. Structure your recommended answer as the first option (with "(Recommended)" appended), and include 1–3 alternatives as the other options. The user can always pick "Other" for a custom answer. This makes decisions faster and forces you to think through the real alternatives before asking. If `AskUserQuestion` is not available (e.g. running in Codex or another non-Claude-Code environment), present the same options as a numbered list in text with your recommendation marked.
- For **open-ended questions** where there aren't clear options (e.g. "what's the business context for this?" or "walk me through how this works"), ask in regular text — don't force options where none naturally exist.
- Resolve dependencies in order: settle the upstream decision before the ones that depend on it.
- If a question can be answered by **exploring the codebase or reading a file/doc**, do that instead of asking. If the user hands you a doc (e.g. a Google Doc, a spec), read it and only surface what's net-new or contradicts existing CONTEXT/ADRs.
- When the user **can't answer** something, capture it as a flag with the right owner and move on. Don't stall.
- Keep going until the user says you're done, or you've covered every branch. Offer a completeness backstop near the end ("anything we haven't touched?").

## Capture file structure

```
# {Topic}: Grilling Session Notes
Date: {date} · Goal: {one line}

## Summary / key decisions
(running synthesis, updated as you go)

## Q&A log
### Q1 — {topic}
- Asked: {question}
- Captured: {facts, decisions, in their words where it matters}
- Doc updates: {CONTEXT.md term added/changed, ADR-NNNN created, or none}
- Flags: {open item -> owner}
...

## Open flags (pending input)
- {item} -> {who can answer}
```

## Domain awareness

During codebase exploration, also look for existing documentation:

### File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## Visual companion (frontend/UI/visual sessions only)

**Hard skip rule:** If the session has no frontend/UI/visual surface — backend work, domain modeling, terminology sharpening, ADR-only discussions, infrastructure, data pipelines — do NOT offer or mention the visual companion at all. Stay in text the entire session, and do not create the `designs/` subfolder.

Only when the session genuinely involves UI layout, component design, navigation, or visual/spatial decisions: create HTML prototypes in `<project-root>/.scratch/grill-with-docs/{YYYY-MM-DD}-{topic-slug}/designs/` so the user can **see** the options instead of reading about them. That folder holds HTML mockups only — never markdown. Read [VISUAL-COMPANION.md](./VISUAL-COMPANION.md) for the full guide — it covers when to show vs. stay in text, how to write prototypes, the CSS toolkit, and design tips.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up — capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

## At the end

- Do a final read of the capture file for contradictions or gaps and reconcile them.
- Verify CONTEXT.md and any new ADRs match the final state in the capture file (the log is the source of truth during the session).
- Give the user a short recap: what's captured, what was added to CONTEXT.md / ADRs, what's still flagged, and the suggested next step.

### Producing the PRD

If the session produced feature-shaped output (something the user wants to ship), turn it into a PRD. Skip this entirely if the session was purely about sharpening terminology or updating CONTEXT.md / ADRs.

Where the PRD lands is determined at setup time by `/setup-skills`, not per-session. The choice is recorded in `docs/agents/issue-tracker.md`. Read that file first to pick the right path:

- **GitHub tracker** → invoke `/to-prd` to publish the PRD as a GitHub issue using the `gh` CLI.
- **Local-markdown tracker** → write the PRD directly into the grill session's own folder as `<project-root>/.scratch/grill-with-docs/{YYYY-MM-DD}-{topic-slug}/prd.md`. The grill session folder doubles as the feature folder: `prd.md` sits at the session root next to `notes.md` and the `designs/` subfolder, and `/to-issues` writes implementation tickets into an `issues/` subfolder (`issues/01-<slug>.md`, `issues/02-<slug>.md`, …). Each artifact type gets its own subfolder; the PRD stays at the root because there's only one. Use the same template `/to-prd` produces: Problem Statement / Solution / User Stories / Implementation Decisions / Testing Decisions / Out of Scope / Further Notes.
- **GitLab or other tracker** → follow the publish path documented in `docs/agents/issue-tracker.md`.

In all cases, append a `## PRD` section to the top of the grill session's `notes.md` with the resulting URL (GitHub/GitLab) or local file path (`prd.md`). For GitHub/GitLab the tracker location is canonical and the link is the audit trail; for local-markdown the PRD already sits in the same folder as `notes.md`, so the link is just a same-folder reference for symmetry.

If `docs/agents/issue-tracker.md` does not exist, the project has not run `/setup-skills` yet. Recommend the user run it first so the PRD destination is unambiguous, rather than guessing.

After the PRD is published or written, recommend running `/to-issues` to break it into independently-grabbable implementation tickets. For local-markdown tracker projects, `/to-issues` should write the numbered issue files into the `issues/` subfolder of this grill session folder, not a separate `.scratch/<feature-slug>/`.

</supporting-info>
