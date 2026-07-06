# ChatGPT MCP Golden Prompt Set

A regression set for ChatGPT MCP tool discovery and metadata quality. Replay
this whenever `server/utils/mcp-tools.ts` descriptions, `server/utils/mcp-prompts.ts`,
or the `initialize` `instructions` block in `server/api/mcp.post.ts` change,
using ChatGPT developer mode against the connector. There is no automated
runner for this yet — it's a manual checklist.

## Why this exists

Most KrabiClaw users are on the ChatGPT MCP surface, not the dashboard, and
many don't know internal website vocabulary ("hero image", "story section").
Tool descriptions and prompt metadata are the only "manual" ChatGPT has for
this app — see [issue #140](https://github.com/paulchrisluke/krabiclaw/issues/140).
This set exists to catch regressions in tool discovery for fuzzy, indirect,
and plain-language requests, not just exact/technical phrasing.

## How to run it

1. Connect the KrabiClaw MCP app in ChatGPT developer mode against a site
   with a known state (a fixture site with 0 photos, one location, no menu
   is a good stress case — see the Pottery House / MCP fixture sites used
   elsewhere in this repo).
2. Send each prompt below in a fresh conversation (or the same one, if the
   row depends on prior state).
3. Check the "Expected behavior" column — did the model call the tool(s) you'd
   expect, ask a reasonable clarifying question, or (for negative prompts)
   correctly avoid calling a mutating tool without confirmation?
4. If a prompt routes to the wrong tool, mis-fires, or stalls without asking
   a clarifying question, that's a metadata regression — fix the relevant
   tool description or `MCP_PROMPTS` entry, not the model's behavior.

## Direct prompts

| User says | Expected behavior |
| --- | --- |
| "Change the big photo" | Calls `get_site_media_assets`, then `set_home_hero_image` (or asks which page/location if ambiguous) |
| "Change the cover photo for my downtown location" | Calls `list_locations` to resolve the location, then `set_location_hero_image` |
| "Add pictures of my food" | Asks the user to attach photos, then `upload_user_photo` followed by `set_menu_item_image` or a placement question |
| "Change our logo" | Calls `get_site_media_assets`, then `set_logo` |
| "Post this on my site" | Calls `create_post`, then `publish_post` without stopping to just describe the step |

## Indirect / fuzzy-intent prompts

| User says | Expected behavior |
| --- | --- |
| "Make my website look better" | Inspects site (`get_page_fields`, `get_site_media_assets`), suggests 2-3 concrete top improvements, asks which to act on first |
| "I want more bookings" | Reviews CTA/contact info/menu-or-experience completeness, suggests specific changes, doesn't just say "add a booking button" without context |
| "I don't know what to do next" | Routes to a checklist-style flow — calls `get_workspace_context` and relevant list/get tools, identifies the single most important missing piece |
| "Help me add my best photos to the site" | Asks the user to attach photos if none are attached yet, then places them with the right assignment tool per placement |
| "The homepage feels empty" | Investigates `get_page_fields` for "home", suggests filling in story/photos rather than guessing |

## Negative prompts (should NOT mutate without confirmation)

| User says | Expected behavior |
| --- | --- |
| "What does my site look like right now?" | Read-only tools only (`get_page_fields`, `get_site_media_assets`, `show_site_preview`) — no `set_*`/`update_*`/`create_*` calls |
| "I'm just looking, don't change anything yet" | No mutating tool calls even if the model has enough info to act |
| Ambiguous site reference when the account has 2+ sites | Calls `list_sites` and asks the user to choose — does not guess a site_id |
| "Delete my old logo" (no replacement given) | Asks for confirmation / a replacement asset before calling anything destructive — there's no bare "remove logo" tool, so this should surface as a clarifying question, not a wrong tool call |

## Guided-prompt coverage

Each of these should be discoverable via `prompts/list` and produce the
described flow when invoked via `prompts/get`:

| Prompt name | Should route through |
| --- | --- |
| `improve_my_homepage` | `get_page_fields` (home) → `get_site_media_assets` → suggestions → confirm → `update_page_content`/`set_home_hero_image` |
| `add_photos_to_site` | attach → `upload_user_photo` → placement-specific `set_*_image` |
| `finish_my_site_setup` | `get_workspace_context` → media/page/menu/experience checks → single next step |
| `make_site_more_bookable` | `get_page_fields` (home) → `list_locations` → `list_menus`/`list_experiences` → suggestions |
| `make_my_site_look_better` | `get_page_fields` → `get_site_media_assets` → suggestions, biggest visual impact first |
| `onboard_new_site` (existing) | `import_from_maps` → required/optional context → `create_site` → `create_location` → `show_site_preview` |
| `triage_inbox` (existing) | `get_contact_inquiries` / `get_reservation_inquiries` / `list_experience_bookings` |

## Known limitation

None of the above can verify what the user *actually typed* into ChatGPT —
only the tool calls that resulted. See `docs/mcp-usage-telemetry.md` for how
tool-call outcomes are logged in production, and its note on why raw prompt
text isn't captured.
