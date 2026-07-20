// MCP Apps (widget) resource definitions for the tenant MCP server. Neutral
// module imported by both mcp-tools/* (tool defs referencing a widget via
// uiResourceUri) and mcp-executor/* (tool executors returning the same URI)
// so neither side has to import the other.

import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'

export const VIDEO_UPLOAD_WIDGET_RESOURCE_URI = "ui://widget/video-upload@v1.html";
export const VIDEO_UPLOAD_WIDGET_ASSET_PATH = "/mcp-assets/video-upload-widget.v1.js";

export interface McpAppResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: "text/html;profile=mcp-app";
}

export const MCP_APP_RESOURCES: McpAppResourceDefinition[] = [
  {
    uri: VIDEO_UPLOAD_WIDGET_RESOURCE_URI,
    name: "KrabiClaw Video Upload",
    description: "Inline video upload widget for the tenant media library.",
    mimeType: "text/html;profile=mcp-app",
  },
];

export interface McpAppResourceContent {
  uri: string;
  mimeType: "text/html;profile=mcp-app";
  text: string;
  _meta: {
    ui: {
      csp: { resourceDomains: string[] };
      domain: string;
    };
    "openai/widgetDomain": string;
  };
}

function videoUploadWidgetHtml(baseUrl: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KrabiClaw Video Upload</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="${baseUrl}${VIDEO_UPLOAD_WIDGET_ASSET_PATH}"></script>
  </body>
</html>`;
}

export async function readMcpAppResource(
  uri: string,
  baseUrl: string,
): Promise<McpAppResourceContent> {
  const resource = MCP_APP_RESOURCES.find((entry) => entry.uri === uri);
  if (!resource) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Unknown MCP app resource: ${uri}`);
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const text = videoUploadWidgetHtml(normalizedBaseUrl);

  let origin: string;
  try {
    origin = new URL(normalizedBaseUrl).origin;
  } catch (_urlError) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid baseUrl: ${baseUrl}`);
  }

  return {
    uri: resource.uri,
    mimeType: resource.mimeType,
    text,
    _meta: {
      ui: {
        csp: { resourceDomains: [origin] },
        domain: origin,
      },
      "openai/widgetDomain": origin,
    },
  };
}
