# SuperDev model setup

Write `.agents/superdev-models.md`, the shared role-to-model map that SuperDev skills read. Missing files and missing roles fall back to the active harness's available models, so this file supplies overrides rather than required configuration.

## Detect available models

Enumerate the model identifiers accepted by the active harness's delegation interface. Prefer a harness-provided models API or CLI. If none can be detected, ask the user for the identifiers they can use.

Never write an unconfirmed identifier. The aliases `inherit-parent` and `auto` are always valid and both select the parent chat model.

## Load current choices

If `.agents/superdev-models.md` exists, read it and treat its values as the current choices. Otherwise use the defaults shown below.

## Confirm the map

Show every role with its current model. Mark a real identifier as invalid when it is not in the detected set. Ask the user whether to keep the map or change specific roles. Offer the detected models plus `inherit-parent` and `auto`.

Panel roles use one subagent per list entry, so list length controls the panel size. This applies to `how critics`, `arena runners`, `architect runners`, and `interrogate reviewers`. `arena cross-judge pool` is also a list, but Arena chooses one model from a family different from the parent's when possible. `swarm workers` supplies the default worker model unless a race assigns a model to each arm.

## Validate and write

Every real model slug must appear in the detected set. Stop and ask for a replacement if it does not. A bad slug breaks delegation for each skill that reads the role.

Overwrite `.agents/superdev-models.md` so reruns converge on one complete map. Use one line per role with these labels and defaults:

```text
# SuperDev model configuration. One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` uses the parent chat model. Alias entries in a panel list still count toward its fan-out.
feature, refactoring: grok-4.6-fast-xhigh
bug-fix: gpt-5.6-sol-max
perf-issue: gpt-5.6-sol-max
hillclimb: gpt-5.6-sol-max
judgment and prose: claude-fable-5-thinking-max
hardest tasks: claude-fable-5-thinking-max
how explorer: grok-4.6-fast-xhigh
how explainer: claude-fable-5-thinking-max
how critics: claude-fable-5-thinking-max, gpt-5.6-sol-max, grok-4.6-fast-xhigh, claude-opus-5-thinking-xhigh
why investigators: grok-4.6-fast-xhigh
why synthesizer: claude-fable-5-thinking-max
reflect tooling: gpt-5.6-sol-max
reflect judgment, divergent, synthesizer: claude-fable-5-thinking-max
arena runners: claude-fable-5-thinking-max, gpt-5.6-sol-max, grok-4.6-fast-xhigh, claude-opus-5-thinking-xhigh
arena cross-judge pool: claude-fable-5-thinking-max, gpt-5.6-sol-max, grok-4.6-fast-xhigh, claude-opus-5-thinking-xhigh
swarm workers: grok-4.6-fast-xhigh
architect runners: claude-fable-5-thinking-max, gpt-5.6-sol-max, grok-4.6-fast-xhigh, claude-opus-5-thinking-xhigh
interrogate reviewers: claude-fable-5-thinking-max, gpt-5.6-sol-max, grok-4.6-fast-xhigh, claude-opus-5-thinking-xhigh
```

Tell the user the model map was written and that rerunning `$superdev-setup` can update it.

Check whether the project has a `verify-*` skill under `.agents/skills` or another way to drive the real app. If it has none, offer once to create a project-local verification skill with `/create-verification-skill`. If the user accepts, read and follow `.agents/skills/create-verification-skill/SKILL.md`.
