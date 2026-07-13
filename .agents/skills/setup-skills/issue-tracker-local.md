# Issue tracker: Local Markdown

Issues for this repo live as markdown files in `.scratch/` **at the project root**.

## Conventions

- One feature per directory: `<project-root>/.scratch/<feature-slug>/`
- Implementation issues are `<project-root>/.scratch/<feature-slug>/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

Find the project root with `git rev-parse --show-toplevel` (or fall back to the nearest folder with a project marker like `package.json`, `pyproject.toml`, `Cargo.toml`, or `.git/` if not in a git repo). Never create `.scratch/` in a subdirectory.

## When a skill says "publish to the issue tracker"

Create a new file under `<project-root>/.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
