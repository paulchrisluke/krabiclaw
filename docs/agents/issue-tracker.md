# GitHub issue tracker

Issues and specs for this repository live in the canonical GitHub repository, `paulchrisluke/krabiclaw`. Use the `gh` CLI for all operations and pass `--repo paulchrisluke/krabiclaw` explicitly because this clone's `origin` remote points to a fork.

## Conventions

- **Create an issue**: `gh issue create --repo paulchrisluke/krabiclaw --title "..." --body "..."`. Use a body file for multi-line bodies.
- **Read an issue**: `gh issue view <number> --repo paulchrisluke/krabiclaw --comments`, including its labels.
- **List issues**: `gh issue list --repo paulchrisluke/krabiclaw --state open --json number,title,body,labels,comments` with appropriate label and state filters.
- **Comment on an issue**: `gh issue comment <number> --repo paulchrisluke/krabiclaw --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --repo paulchrisluke/krabiclaw --add-label "..."` or `--remove-label "..."`.
- **Close an issue**: `gh issue close <number> --repo paulchrisluke/krabiclaw --comment "..."`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests. Resolve an ambiguous number with `gh pr view <number> --repo paulchrisluke/krabiclaw`, then fall back to `gh issue view <number> --repo paulchrisluke/krabiclaw`.

## Publishing and fetching

When a skill says "publish to the issue tracker," create an issue in `paulchrisluke/krabiclaw`.

When a skill says "fetch the relevant ticket," run `gh issue view <number> --repo paulchrisluke/krabiclaw --comments`.

## Wayfinding operations

Wayfinder uses a single map issue with linked child decision tickets.

- **Map**: Create one issue labeled `wayfinder:map`. Its body holds Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child ticket**: Create an issue with one of `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`. Link it to the map as a GitHub sub-issue through the API. If sub-issues are unavailable, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body.
- **Blocking**: Use GitHub's native issue dependencies. Add a dependency with `gh api --method POST repos/paulchrisluke/krabiclaw/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`. Fetch the numeric database ID with `gh api repos/paulchrisluke/krabiclaw/issues/<number> --jq .id`. If dependencies are unavailable, put `Blocked by: #<number>` at the top of the child body.
- **Frontier query**: List the map's open child issues, then exclude issues with an open blocker or an assignee. The first remaining issue in map order is next.
- **Claim**: Assign the ticket before work with `gh issue edit <number> --repo paulchrisluke/krabiclaw --add-assignee @me`.
- **Resolve**: Post the answer as a comment, close the ticket, then append a one-line gist and ticket link to the map's Decisions so far section.
