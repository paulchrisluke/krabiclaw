# Repository setup

Scaffold the per-repository configuration used by the engineering skills:

- Issue tracker: where issues live, with GitHub as the default when the remote supports it
- Triage labels: the strings used for the five canonical triage roles
- Domain docs: where `CONTEXT.md` and ADRs live, plus the rules for reading them

This is a guided setup. Explore first, show what you found, confirm choices with the user, then write.

## Explore

Inspect the current repository without assuming its state:

- Run `git remote -v` and read `.git/config` to identify the host and repository.
- Check for `AGENTS.md` and `CLAUDE.md`, including an existing `## Agent skills` section.
- Check for root `CONTEXT.md` and `CONTEXT-MAP.md` files.
- Check `docs/adr/` and any `src/*/docs/adr/` directories.
- Check whether `docs/agents/` contains prior setup output.
- Check for `.scratch/`, which may signal a local Markdown issue tracker.
- Check whether the `triage` skill is installed. This decides whether triage-label setup runs.
- Look for real monorepo signals: `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or populated `packages/*` directories with their own `src/` trees. Without these signals, use a single domain context.

## Present findings and ask

Summarize what exists and what is missing. Take the following sections in order, one answer at a time. Lead with the recommended choice so the user can accept it in a word. Skip a question when inspection already settles it.

### Issue tracker

Explain that skills such as `to-tickets`, `triage`, and `to-spec` need to know where issues live and how to operate on them.

If a remote points to GitHub, recommend GitHub. If a remote points to GitLab, including a self-hosted GitLab instance, recommend GitLab. Otherwise offer:

- GitHub Issues, operated with `gh`
- GitLab Issues, operated with `glab`
- Local Markdown under `.scratch/<feature>/`
- Another tracker such as Jira or Linear, described by the user in one paragraph

Record the choice in `docs/agents/issue-tracker.md`. The GitHub and GitLab templates contain a pull-request or merge-request triage flag. Keep it off unless the user explicitly asks to use external contributions as triage requests.

### Triage label vocabulary

Skip this section if the `triage` skill is not installed.

Ask one question: "Do you want to keep the default triage labels? Recommended: yes."

The canonical roles and default tracker strings are `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. If the user declines, collect mappings to the repository's existing labels so the skills do not create duplicates.

### Domain docs

Use a single context by default: one root `CONTEXT.md` and root `docs/adr/` directory. Do not ask about this default unless inspection found monorepo signals.

For a monorepo, offer a multi-context layout with a root `CONTEXT-MAP.md` pointing to per-context `CONTEXT.md` files, then confirm the choice.

## Confirm the draft

Before writing, show the user:

- The `## Agent skills` block that will go into `CLAUDE.md` or `AGENTS.md`
- The proposed `docs/agents/issue-tracker.md`
- The proposed `docs/agents/domain.md`
- The proposed `docs/agents/triage-labels.md` when the `triage` skill is installed

Allow edits before writing.

## Write

Choose the instruction file as follows:

- If `CLAUDE.md` exists, edit it.
- Otherwise, if `AGENTS.md` exists, edit it.
- If neither exists, ask which one the user wants to create.

Never create one instruction file when the other already exists. If the chosen file already has an `## Agent skills` section, update that section instead of appending a duplicate. Preserve surrounding user content.

Use this block, omitting triage labels when the `triage` skill is not installed:

```markdown
## Agent skills

### Issue tracker

[One-line summary of where issues are tracked]. See `docs/agents/issue-tracker.md`.

### Triage labels

[One-line summary of the label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[One-line summary naming the single-context or multi-context layout]. See `docs/agents/domain.md`.
```

Use these seed templates:

- [issue-tracker-github.md](./issue-tracker-github.md) for GitHub
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md) for GitLab
- [issue-tracker-local.md](./issue-tracker-local.md) for local Markdown
- [triage-labels.md](./triage-labels.md) when `triage` is installed
- [domain.md](./domain.md) for domain-document rules and layout

For another tracker, write `docs/agents/issue-tracker.md` from the user's description.

## Finish

Name the files written and the engineering skills that now consume them. The user may edit `docs/agents/*.md` directly later. They only need to rerun setup to switch trackers or replace the configuration.
