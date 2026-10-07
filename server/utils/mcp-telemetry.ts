import { execute, type DbClient } from "~/server/db";
import { anonymizeId } from "~/server/utils/platform-telemetry";
import { recordUsageEvent } from "~/server/utils/usage-metering";

// Only typed operational facts are stored. Free text, names, identifiers,
// attachment URLs and arbitrary request/result fields never enter summaries.
const COUNT_FIELDS = new Set(['count', 'total', 'limit', 'offset', 'party_size', 'quantity', 'capacity', 'remaining_capacity', 'duration_ms', 'unit_amount', 'amount']);
const BOOLEAN_FIELDS = new Set(['success', 'isError', 'completed', 'operation_completed', 'action_required', 'has_more', 'has_next_page', 'acknowledge_guest', 'confirm', 'replayed']);
const STATUS_VALUES = new Set(['success', 'error', 'auth_required', 'blocked', 'action_required', 'pending', 'pending_review', 'confirmed', 'cancelled', 'declined', 'rejected', 'draft', 'published', 'unpublished', 'active', 'inactive', 'paid', 'unpaid', 'refunded', 'partially_refunded', 'failed', 'processing', 'completed']);
const CONTAINER_FIELDS = new Set(['structuredContent', 'result', 'data', 'page_info', 'booking', 'reservation', 'payment']);
const MCP_METHODS = new Set(['initialize', 'ping', 'notifications/initialized', 'tools/list', 'tools/call', 'resources/list', 'resources/templates/list', 'resources/read', 'prompts/list', 'prompts/get']);

export function mcpTelemetryMethod(method: string | null | undefined): string {
  return method && MCP_METHODS.has(method) ? method : 'unknown';
}

function operationalSummary(value: unknown, depth = 0): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) return null;
  const summary: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (COUNT_FIELDS.has(key) && typeof field === 'number' && Number.isFinite(field)) summary[key] = field;
    else if (BOOLEAN_FIELDS.has(key) && typeof field === 'boolean') summary[key] = field;
    else if (key === 'status' && typeof field === 'string' && STATUS_VALUES.has(field)) summary[key] = field;
    else if (CONTAINER_FIELDS.has(key)) {
      const nested = operationalSummary(field, depth + 1);
      if (nested) summary[key] = nested;
    }
  }
  return Object.keys(summary).length ? summary : null;
}

export function summarizeForTelemetry(value: unknown): string | null {
  const summary = operationalSummary(value);
  return summary ? JSON.stringify(summary) : null;
}

export type McpToolCallStatus = "success" | "error" | "auth_required" | "blocked";

export interface LogMcpToolCallEventInput {
  env?: ApiRecord | null;
  organizationId?: string | null;
  locationId?: string | null;
  userId?: string | null;
  mcpSurface?: "client" | "public_help";
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
  httpStatus?: number | null;
  jsonrpcErrorCode?: number | null;
  jsonrpcErrorMessage?: string | null;
  protocolVersion?: string | null;
  sessionId?: string | null;
  oauthClientId?: string | null;
  userAgent?: string | null;
  cfRayId?: string | null;
  catalogFingerprint?: string | null;
  unknownToolName?: string | null;
  durationMs?: number | null;
}

function hashIdentifier(env: ApiRecord | null | undefined, value: string | null | undefined) {
  if (!env || !value) return null;
  try {
    return anonymizeId(value, env);
  } catch {
    return null;
  }
}

// Fire-and-forget by convention: callers should wrap this in waitUntil (or let
// it run detached) rather than await it inline — telemetry must never add
// latency to, or fail, an MCP response.
export async function logMcpToolCallEvent(
  db: DbClient,
  input: LogMcpToolCallEventInput,
): Promise<void> {
  const mcpSurface = input.mcpSurface ?? "client";
  await execute(
      db,
      `
      INSERT INTO mcp_tool_call_events
        (id, organization_id, location_id, user_id, mcp_surface, request_id,
         method, tool_name, tool_domain, is_mutating, arguments_summary_json,
         result_summary_json, status, error_code, error_message,
         http_status, jsonrpc_error_code, jsonrpc_error_message, protocol_version,
         session_id_hash, oauth_client_id_hash, user_agent, cf_ray_id,
         catalog_fingerprint, unknown_tool_name, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        crypto.randomUUID(),
        input.organizationId ?? null,
        input.locationId ?? null,
        input.userId ?? null,
        mcpSurface,
        input.requestId == null ? null : String(input.requestId),
        mcpTelemetryMethod(input.method),
        input.unknownToolName ? null : input.toolName ?? null,
        input.toolDomain ?? null,
        input.isMutating == null ? null : input.isMutating ? 1 : 0,
        summarizeForTelemetry(input.arguments),
        summarizeForTelemetry(input.result),
        input.status,
        input.errorCode == null ? null : String(input.errorCode),
        input.errorMessage ? "MCP operation failed; see error code and status." : null,
        input.httpStatus ?? null,
        input.jsonrpcErrorCode ?? (typeof input.errorCode === "number" ? input.errorCode : null),
        (input.jsonrpcErrorMessage ?? input.errorMessage) ? "MCP operation failed; see error code and status." : null,
        input.protocolVersion ?? null,
        hashIdentifier(input.env, input.sessionId),
        hashIdentifier(input.env, input.oauthClientId),
        null,
        input.cfRayId ?? null,
        input.catalogFingerprint ?? null,
        hashIdentifier(input.env, input.unknownToolName),
        input.durationMs ?? null,
      ],
  );

  if (input.method === "tools/call" && input.organizationId) {
    await recordUsageEvent(db, {
        organizationId: input.organizationId,
        resource: "mcp_operation",
        source: mcpSurface,
        provider: mcpSurface === "client" ? "mcp_client" : "krabiclaw",
        channel: "tools/call",
        quantity: 1,
        unit: "tool_call",
        metadata: {
          toolName: input.toolName ?? null,
          toolDomain: input.toolDomain ?? null,
          status: input.status,
          httpStatus: input.httpStatus ?? null,
        },
        idempotencyKey: `mcp:${mcpSurface}:${input.requestId == null ? crypto.randomUUID() : String(input.requestId)}`,
    });
  }
}

// The Privacy Policy's MCP telemetry limit: a row is deleted 180 days after it
// was created. Runs in the daily analytics task beside the pageview cleanup.
export async function cleanupMcpToolCallEvents(db: DbClient, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 180 * 86_400_000).toISOString();
  const result = await execute(db, "DELETE FROM mcp_tool_call_events WHERE created_at < ?", [cutoff]);
  return Number(result.meta.changes);
}
