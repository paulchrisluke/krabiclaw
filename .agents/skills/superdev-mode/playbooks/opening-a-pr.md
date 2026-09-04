### Opening a PR

Invoked at the end of every other playbook.

**Worktree.** Work from a git worktree off main; subagents inherit it. Multiple delegated writers on the same branch each get their own worktree. Dirty branch with unrelated work: patch out, fresh worktree, apply. Snarled worktree: reset from main, redo minimally.

**Commits.** Commit liberally; rebase into small, ordered commits before opening PRs. Each commit is a future PR: landable, ordered to tell the story. Amend when the fix belongs in a just-made commit; new commit when separable.

**PRs.** Run the available code-cleanup pass before commit. Run `.agents/skills/no-comments/SKILL.md` before review. Write every PR title, PR description, and commit body with `.agents/skills/technical-writing/SKILL.md`, then apply `.agents/skills/unslop/SKILL.md`. Apply every technical-writing layer except Diataxis. Use one word for each action, keep articles, and avoid `-ing` when a plain verb works.

**Titles.** Use Conventional Commits in the form `type(scope): subject`. Use `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, or `perf` as the type. Use the changed area, such as `superdev-mode`, as the scope. Keep the subject short and imperative. Name a real symbol when one carries the change. Do not add a trailing period.

**Descriptions.** Use these sections in order. Drop a section when it is empty.

- `## Why`. State the intent and why this approach fits.
- `## Scope`. State facts from the diff. Name real symbols and paths. Name both sides of a rename or retarget. State what is in and out when the boundary matters.
- `## Tradeoffs`. State real choices only.
- `## Blast Radius`. State who and what the change touches. Explain why the change is safe or risky. If main is red without the fix, name the continuing cost.
- `## Verification`. State how you ran each check and its rigor. Name the real path, such as the project's verification skill or targeted tests. State the outcome of each check, not only the command name.

After these sections, attach videos or screenshots when they prove a claim. Do not use `## Summary` or `## Test plan` boilerplate. A commit body does not restate its subject.

**Size and stacks.** Prefer five narrow PRs to one large PR. Stack follow-ups with the repository's stacking tool, and keep the ordered stack visible to reviewers. Branch from main only for independent work. Rebase on `main` before substantial stack work.

**Readiness.** Open every PR ready, never as a draft. If the repository host or PR tool defaults to draft, set its ready option on creation. If a PR still opens as a draft, run the host's ready command, such as `gh pr ready <number>`. Inspect the PR before you refer to its status.

**Babysit.** Opening a PR does not start a babysit. Post the URL and keep building. Finish the phase or stack first. Run a separate Babysit playbook only when the user asks for one after the whole stack exists. A babysit for each new PR stalls the build and spends checks on commits that later waves restart. Push back when feedback drifts from intent.

A delegated agent that opens a PR runs `interrogate`, the available code-cleanup pass, and `no-comments`. It returns the URL and does not babysit. Return to the parent.
