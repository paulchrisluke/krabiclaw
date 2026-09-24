import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { queryFirst } from '~/server/db'
import { getMcpTool } from '~/server/utils/mcp-tools'
import { requireMcpOrganization, requireMcpUser, type McpUserContext } from '~/server/utils/mcp-auth'
import { resolveMcpWorkspace } from '~/server/utils/mcp-context'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { validateArguments } from '~/server/utils/mcp-tool-validation'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { hasOrganizationEntitlement } from '~/server/utils/billing'
import { handleAnalyticsTools } from './analytics'
import { handleBlogTools } from './blog'
import { handleContentTools } from './content'
import { handleLocalesTools } from './locales'
import { handleLocationsTools } from './locations'
import { handleMediaTools } from './media'
import { handleProductsTools } from './products'
import { handleOnboardingTools } from './onboarding'
import { handlePostsTools } from './posts'
import { handleQaTools } from './qa'
import { handleReviewsTools } from './reviews'
import { handleOrganizationsTools } from './organizations'
import { handleSubmissionsTools } from './submissions'
import {
  NOT_HANDLED,
  humanizeEntitlement,
  normalizeWorkspaceArguments,
  resolveOrganizationPublicOrigin,
  validateRequiredArguments,
  workspaceContextPayload,
  workspaceLocationsPayload,
  workspaceOrganizationsPayload,
} from './shared'
import type { McpExecutorContext } from './shared'

// Exported so non-MCP callers (chowbot-adapter.ts) dispatch through the same
// domain-handler registry instead of hand-copying it — one list of which
// domain owns which tool, not two.
export const DOMAIN_HANDLERS: Record<string, (_ctx: McpExecutorContext) => Promise<unknown>> = {
  analytics: handleAnalyticsTools,
  blog: handleBlogTools,
  content: handleContentTools,
  locales: handleLocalesTools,
  locations: handleLocationsTools,
  media: handleMediaTools,
  products: handleProductsTools,
  onboarding: handleOnboardingTools,
  posts: handlePostsTools,
  qa: handleQaTools,
  reviews: handleReviewsTools,
  organizations: handleOrganizationsTools,
  submissions: handleSubmissionsTools,
}

export async function executeMcpToolCall(
  event: H3Event,
  toolName: string,
  rawArguments: Record<string, unknown>,
  authenticatedUser?: McpUserContext,
) {
  const tool = getMcpTool(toolName);
  if (!tool) {
    throw mcpProtocolError(
      MCP_ERROR.methodNotFound,
      `Unknown tool: ${toolName}`,
      { unknownToolName: toolName },
      'protocol',
    );
  }

  validateArguments(tool.inputSchema, rawArguments);

  const normalizedArguments = await normalizeWorkspaceArguments(
    event,
    toolName,
    tool.inputSchema,
    rawArguments,
    authenticatedUser,
  );

  validateRequiredArguments(tool.inputSchema, normalizedArguments);

  if (toolName === "list_organizations") {
    const user = authenticatedUser ?? await requireMcpUser(event);
    const workspace = await resolveMcpWorkspace(
      user.db,
      user.env,
      user.userId,
    );
    const organizations = workspace.organizations.map((entry) => ({
      id: entry.id,
      name: entry.name ?? entry.slug,
      subdomain: entry.subdomain,
      orgSlug: entry.slug,
      publicUrl: resolveOrganizationPublicOrigin({ public_url: entry.public_url }),
      status: entry.status,
      active: entry.id === workspace.organization?.id,
    }));
    const currentUser = {
      id: user.userId,
      isPlatformAdmin: user.isPlatformAdmin,
    };
    const page = paginateMcpCollection(organizations, rawArguments, { resource: `organizations:${user.userId}` });
    return renderStructuredResponse(
      { organizations: page.items, currentUser, page_info: page.page_info },
      organizations.length === 0
        ? "You have no organizations yet. Create your site and locations in the KrabiClaw CMS, then return here to manage their content."
        : `You have ${organizations.length} organization${organizations.length > 1 ? "s" : ""}: ${organizations.map((entry) => entry.name).join(", ")}.`,
    );
  }

  if (toolName === "get_workspace_context") {
    const user = authenticatedUser ?? await requireMcpUser(event);
    const workspace = await resolveMcpWorkspace(
      user.db,
      user.env,
      user.userId,
    );
    return {
      context: workspaceContextPayload(workspace.organization, workspace.location),
      organizations: workspaceOrganizationsPayload(workspace),
      locations: workspaceLocationsPayload(workspace),
    };
  }

  if (toolName === "set_workspace_context") {
    const user = authenticatedUser ?? await requireMcpUser(event);
    const organizationId = optionalString(normalizedArguments, "organization_id");
    const locationId = optionalString(normalizedArguments, "location_id");
    let workspace;
    try {
      workspace = await resolveMcpWorkspace(
        user.db,
        user.env,
        user.userId,
        {
          organizationId,
          locationId,
          requireOrganization: Boolean(organizationId) || Boolean(locationId),
          requireLocation: Boolean(locationId),
        },
      );
      if (!workspace.organization && !workspace.location) {
        throw new Error("Workspace context is empty. At least one of organization or location must be resolved.");
      }
    } catch (error) {
      rethrowWorkspaceError(error);
    }

    await upsertMcpWorkspacePreference(user.db, {
      userId: user.userId,
      organizationId: workspace.organization?.id ?? null,
      locationId: workspace.location?.id ?? null,
    });

    const refreshed = await resolveMcpWorkspace(
      user.db,
      user.env,
      user.userId,
      {
        organizationId: workspace.organization?.id ?? null,
        locationId: workspace.location?.id ?? null,
      },
    );

    return {
      success: true,
      context: workspaceContextPayload(refreshed.organization, refreshed.location),
      organizations: workspaceOrganizationsPayload(refreshed),
      locations: workspaceLocationsPayload(refreshed),
    };
  }

  const organizationId = requiredString(normalizedArguments, "organization_id");
  const organization = await requireMcpOrganization(event, organizationId, tool.minimumRole, authenticatedUser);
  const args = omit(normalizedArguments, ["organization_id"]);
  const explicitLocationId = optionalString(rawArguments, "location_id");
  if (explicitLocationId) {
    const location = await queryFirst<{ id: string }>(organization.db, `
      SELECT id
      FROM business_locations
      WHERE id = ? AND organization_id = ? 
      LIMIT 1
    `, [explicitLocationId, organization.organizationId]);
    if (!location) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, "Location not found for this organization.");
    }
  }

  if (
    tool.requiredEntitlement &&
    !(await hasOrganizationEntitlement(organization.env as CloudflareEnv, organization.organizationId,
      tool.requiredEntitlement,
    ))
  ) {
    throw new HTTPError({
      statusCode: 403,
      statusMessage: `${humanizeEntitlement(tool.requiredEntitlement)} is not enabled for this organization.`,
    });
  }

  const domainHandler = tool.domain ? DOMAIN_HANDLERS[tool.domain] : undefined;
  if (domainHandler) {
    const result = await domainHandler({ event, toolName, rawArguments, normalizedArguments, tool, organizationId, organization, args });
    if (result !== NOT_HANDLED) return result;
  }
  throw mcpProtocolError(
        MCP_ERROR.methodNotFound,
        `Unhandled tool: ${toolName}`,
      );
}
