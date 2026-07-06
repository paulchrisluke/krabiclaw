import type { McpExecutorContext } from './shared'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { buildTranslationInventory, createTranslationJob, publishTranslationDrafts } from '~/server/utils/translation-inventory'
import { listTranslationReviewItems, saveTranslationReviewItem } from '~/server/utils/translation-review'
import { parseScope } from '~/server/utils/translation-helpers'
import { processTranslationJobBatch } from '~/server/utils/translation-processor'
import { queryAll, queryFirst } from '~/server/db'
import { NOT_HANDLED, mutationContextPayload, objectRecord, optionalString, requiredString } from './shared'

const VALID_ENTITY_TYPES = ['site_content', 'menu', 'menu_item', 'business_location', 'post'] as const
const VALID_REVIEW_STATUSES = ['all', 'missing', 'draft', 'published', 'stale'] as const

function validEntityType(args: Record<string, unknown>, key: string) {
  const value = requiredString(args, key)
  if (!(VALID_ENTITY_TYPES as readonly string[]).includes(value)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}: must be one of ${VALID_ENTITY_TYPES.join(', ')}`)
  }
  return value as (typeof VALID_ENTITY_TYPES)[number]
}

function validReviewStatus(args: Record<string, unknown>, key: string) {
  const value = optionalString(args, key) ?? 'all'
  if (!(VALID_REVIEW_STATUSES as readonly string[]).includes(value)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}: must be one of ${VALID_REVIEW_STATUSES.join(', ')}`)
  }
  return value as (typeof VALID_REVIEW_STATUSES)[number]
}

export async function handleTranslationsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "get_translation_inventory":
      return await buildTranslationInventory(
        site.db,
        site.organizationId,
        site.siteId,
        {
          targetLocale: requiredString(args, "locale"),
          scope: parseScope(optionalString(args, "scope") ?? undefined),
          includePublished: true,
        },
      );
    case "start_translation_job": {
      const job = await createTranslationJob(
        site.db,
        site.organizationId,
        site.siteId,
        site.userId,
        {
          targetLocale: requiredString(args, "locale"),
          scope: parseScope(optionalString(args, "scope") ?? undefined),
          includePublished: args.includePublished === true,
        },
      );
      const result = await processTranslationJobBatch(
        site.db,
        site.env,
        site.organizationId,
        site.siteId,
        job.id,
      );
      return { job, first_batch: result, context: await mutationContextPayload(site) };
    }
    case "list_translation_jobs": {
      const jobs = await queryAll(
        site.db,
        `
        SELECT id, source_locale, target_locale, scope, status, total_items, total_chars,
               estimated_input_tokens, estimated_output_tokens, estimated_credits,
               actual_input_tokens, actual_output_tokens, actual_credits,
               processed_items, failed_items, error, created_at, updated_at, started_at, finished_at
        FROM translation_jobs
        WHERE organization_id = ? AND site_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `,
        [site.organizationId, site.siteId],
      );
      return { jobs };
    }
    case "get_translation_job": {
      const jobId = requiredString(args, "job_id");
      const job = await queryFirst(
        site.db,
        `
        SELECT *
        FROM translation_jobs
        WHERE id = ? AND organization_id = ? AND site_id = ?
        LIMIT 1
      `,
        [jobId, site.organizationId, site.siteId],
      );
      if (!job) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          `Translation job not found: ${jobId}`,
        );
      }
      const items = await queryAll(
        site.db,
        `
        SELECT id, entity_type, entity_id, location_id, page, field, source_hash, source_chars, status, error, created_at, updated_at
        FROM translation_job_items
        WHERE job_id = ? AND organization_id = ? AND site_id = ?
        ORDER BY entity_type, page, field
        LIMIT 500
      `,
        [jobId, site.organizationId, site.siteId],
      );
      return { job, items };
    }
    case "run_translation_job_batch":
      {
        const result = await processTranslationJobBatch(
        site.db,
        site.env,
        site.organizationId,
        site.siteId,
        requiredString(args, "job_id"),
        );
        return { ...result, context: await mutationContextPayload(site) };
      }
    case "get_translation_review_items":
      return await listTranslationReviewItems(
        site.db,
        site.organizationId,
        site.siteId,
        {
          targetLocale: requiredString(args, "locale"),
          scope: parseScope(optionalString(args, "scope") ?? undefined),
          status: validReviewStatus(args, "status"),
        },
      );
    case "save_translation_review_item":
      {
        const result = await saveTranslationReviewItem(
        site.db,
        site.organizationId,
        site.siteId,
        {
          targetLocale: requiredString(args, "locale"),
          scope: parseScope(optionalString(args, "scope") ?? undefined),
          entityType: validEntityType(args, "entity_type"),
          entityId: requiredString(args, "entity_id"),
          field: requiredString(args, "field"),
          fields: objectRecord(args.fields, "fields"),
        },
        );
        return { ...result, context: await mutationContextPayload(site) };
      }
    case "publish_translations":
      {
        const result = await publishTranslationDrafts(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "locale"),
        parseScope(optionalString(args, "scope") ?? undefined),
        site.userId,
        );
        return { ...result, context: await mutationContextPayload(site) };
      }
    default:
      return NOT_HANDLED
  }
}
