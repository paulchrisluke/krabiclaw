# Agent Skills

Agent Skills are reusable instruction bundles for AI-assisted authoring workflows. They provide quality guidance; product correctness stays in backend contracts, permissions, schema validation, media storage, and publication workflows.

## Current Scaffold

The first MCP-exposed scaffold supports two tasks:

- `blog.write`
- `image.generate`

Both tenant MCP and platform MCP use the same resolver and review contract in `server/utils/agent-skills/`. Tenant tools are:

- `resolve_agent_guidance`
- `review_agent_guidance_candidate`

Platform tools use platform naming:

- `resolve_platform_agent_guidance`
- `review_platform_agent_guidance_candidate`

MCP tools are read/review-only. They cannot create, edit, activate, or archive skills. CMS/admin lifecycle tables and provenance-bound persistence are future work.

## Scope Hierarchy

Resolution is scoped as:

1. `platform`
2. `organization`
3. `site`

Direct conflicts resolve by specificity: site overrides organization, organization overrides platform. Within one scope, lower `priority` sorts first, then `slug` ascending.

The scaffold currently returns reusable platform baseline skills only. It still returns the requested scope and full scope order so tenant and platform callers use the same output shape before CMS-backed organization/site skills land.

## Review Semantics

`review_*_agent_guidance_candidate` reviews the exact candidate object against the exact resolved guidance and returns:

- `resolution_fingerprint`
- `candidate_fingerprint`
- advisory findings
- `recommendation`
- `persistence: "not_persisted"`

This is review evidence, not a publication blocker and not a persisted provenance record. Once the database lifecycle lands, persisted blog revisions and generated media assets must link to a completed review run for the exact candidate fingerprint.

## Security Boundary

Skills must not contain or enforce:

- authorization or tenant membership rules
- tool input/output schemas
- publication approval requirements
- scheduling behavior
- generated-image file transport
- media assignment rules
- provider upload details

Those invariants remain in code and MCP contracts. Skill text can describe voice, quality goals, creative direction, examples, and task workflow reminders.

Tenant data isolation is mandatory: generic platform baselines must not mention customer-specific examples, motifs, locations, offers, or media. Tenant-specific guidance belongs in future organization/site skill versions, not hard-coded product modules.

## Image Generation Contract

For generated images, the skill reinforces the canonical MCP flow:

1. Generate with ChatGPT native `image_generation` using `gpt-image-1` or `gpt-image-2`.
2. Persist tenant generated output with `save_generated_image_file({ site_id, attachment_id, prompt })`.
3. Pass a file reference as `attachment_id`; never pass raw `image_generation_call.result` base64 to MCP tools.
4. Use `show_generated_images` with the saved `assetId` and `publicUrl`.

Raw base64 is only for the separate non-native `save_generated_image` path.
