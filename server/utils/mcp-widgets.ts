// MCP Apps (widget) resource definitions for the tenant MCP server. Neutral
// module imported by both mcp-tools/* (tool defs referencing a widget via
// uiResourceUri) and mcp-executor/* (tool executors returning the same URI)
// so neither side has to import the other.

export const MEDIA_UPLOAD_WIDGET_RESOURCE_URI = "kc-mcp-app://media-upload";

export interface McpAppResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: "text/html;profile=mcp-app";
}

export const MCP_APP_RESOURCES: McpAppResourceDefinition[] = [
  {
    uri: MEDIA_UPLOAD_WIDGET_RESOURCE_URI,
    name: "KrabiClaw Media Upload",
    description: "Inline image/video upload widget for the tenant media library.",
    mimeType: "text/html;profile=mcp-app",
  },
];

export interface McpAppResourceContent {
  uri: string;
  mimeType: "text/html;profile=mcp-app";
  text: string;
  _meta: { ui: { csp: { resourceDomains: string[] } } };
}

function mediaUploadWidgetHtml(baseUrl: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KrabiClaw Media Upload</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="${baseUrl}/mcp-assets/media-upload-widget.js"></script>
  </body>
</html>`;
}

export async function readMcpAppResource(
  uri: string,
  baseUrl: string,
): Promise<McpAppResourceContent> {
  const resource = MCP_APP_RESOURCES.find((entry) => entry.uri === uri);
  if (!resource) {
    throw new Error(`Unknown MCP app resource: ${uri}`);
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const text = mediaUploadWidgetHtml(normalizedBaseUrl);
  const origin = new URL(normalizedBaseUrl).origin;

  return {
    uri: resource.uri,
    mimeType: resource.mimeType,
    text,
    _meta: { ui: { csp: { resourceDomains: [origin] } } },
  };
}
