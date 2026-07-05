import { execute, type DbClient } from "~/server/db";

// Field names that must never be logged verbatim, regardless of tool.
const SENSITIVE_KEY_PATTERN =
  /token|secret|password|authoriz|api[_-]?key|access[_-]?key|credential|cookie|base64|image_data|file_data|attachment_id|download_url|external_url/i;

// Field names that may contain user PII — logged as a length marker, not the value.
const PII_KEY_PATTERN = /email|phone|address|name|guest_name|full_name|first_name|last_name/i;

const MAX_STRING_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 4000;
const MAX_ARRAY_ITEMS = 10;
const MAX_DEPTH = 4;

function looksLikeBase64(value: string): boolean {
  return value.length > 200 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function redactValue(key: string, value: unknown, depth: number): unknown {
  if (value == null) return value;

  if (SENSITIVE_KEY_PATTERN.test(key)) return "[redacted]";
  if (PII_KEY_PATTERN.test(key)) {
    return typeof value === "string" ? `[redacted:len=${value.length}]` : "[redacted]";
  }

  if (typeof value === "string") {
    if (looksLikeBase64(value)) return `[base64:len=${value.length}]`;
    if (value.length > MAX_STRING_LENGTH) {
      return `${value.slice(0, MAX_STRING_LENGTH)}…[truncated:len=${value.length}]`;
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return "[array]";
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactValue(key, item, depth + 1));
  }

  if (typeof value === "object") {
    if (depth >= MAX_DEPTH) return "[object]";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(k, v, depth + 1);
    }
    return out;
  }

  return String(value);
}

// Redacts sensitive/PII fields and truncates long strings before storage.
// Used for both call arguments and tool results — never store either raw.
export function summarizeForTelemetry(value: unknown): string | null {
  if (value == null) return null;
  try {
    const redacted = redactValue("", value, 0);
    const json = JSON.stringify(redacted);
    if (!json) return null;
    return json.length > MAX_SUMMARY_LENGTH
      ? `${json.slice(0, MAX_SUMMARY_LENGTH)}…[truncated]`
      : json;
  } catch {
    return "[unserializable]";
  }
}

export function truncateText(value: string | null | undefined, maxLength = 500): string | null {
  if (!value) return null;
  return value.length > maxLength ? `${value.slice(0, maxLength)}…[truncated]` : value;
}

export type McpToolCallStatus = "success" | "error" | "auth_required" | "blocked";

export interface LogMcpToolCallEventInput {
  organizationId?: string | null;
  siteId?: string | null;
  locationId?: string | null;
  userId?: string | null;
  mcpSurface?: "client" | "platform";
  requestId?: string | number | null;
  method: string;
  toolName?: string | null;
  toolDomain?: string | null;
  isMutating?: boolean | null;
  arguments?: unknown;
  result?: unknown;
  status: McpToolCallStatus;
  errorCode?: string | number | null;
  errorMessage?: string | null;
  durationMs?: number | null;
}

// Fire-and-forget by convention: callers should wrap this in waitUntil (or let
// it run detached) rather than await it inline — telemetry must never add
// latency to, or fail, an MCP response.
export async function logMcpToolCallEvent(
  db: DbClient,
  input: LogMcpToolCallEventInput,
): Promise<void> {
  try {
    await execute(
      db,
      `
      INSERT INTO mcp_tool_call_events
        (id, organization_id, site_id, location_id, user_id, mcp_surface, request_id,
         method, tool_name, tool_domain, is_mutating, arguments_summary_json,
         result_summary_json, status, error_code, error_message, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        crypto.randomUUID(),
        input.organizationId ?? null,
        input.siteId ?? null,
        input.locationId ?? null,
        input.userId ?? null,
        input.mcpSurface ?? "client",
        input.requestId == null ? null : String(input.requestId),
        input.method,
        input.toolName ?? null,
        input.toolDomain ?? null,
        input.isMutating == null ? null : input.isMutating ? 1 : 0,
        summarizeForTelemetry(input.arguments),
        summarizeForTelemetry(input.result),
        input.status,
        input.errorCode == null ? null : String(input.errorCode),
        truncateText(input.errorMessage),
        input.durationMs ?? null,
      ],
    );
  } catch (err: unknown) {
    console.warn("[mcp-telemetry] failed to log tool call event:", String(err));
  }
}
