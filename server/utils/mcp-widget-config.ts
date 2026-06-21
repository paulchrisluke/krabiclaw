// Single source of truth for which MCP tools render a widget in production.
// Imported by server/api/mcp.post.ts (enforcement) and server/api/dev/widget-config.get.ts
// (so the dev test harness at public/widget-test.html can reflect live behavior instead of drifting).
//
// Most onboarding/selection tools (import_from_maps, show_generated_images, show_site_preview,
// list_sites) deliberately have no widgetName in mcp-tools.ts — a custom widget was overkill
// for basic list/selection output, so they always fall back to plain text. show_welcome and
// show_vertical_picker were removed entirely (duplicated list_sites / added no value without
// a widget). request_photo_upload is the only tool that still needs a real widget (an in-chat
// file picker can't be expressed as text).
export const WIDGETS_ENABLED = false;

export const ENABLED_WIDGET_TOOLS = new Set([
  "request_photo_upload",
]);

export function isWidgetEnabledForTool(toolName: string): boolean {
  return WIDGETS_ENABLED || ENABLED_WIDGET_TOOLS.has(toolName);
}
