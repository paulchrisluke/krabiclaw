import type { McpExecutorContext } from './shared'
import { createExperience, deleteExperience, getExperienceBookingsSummary, getExperienceById, getSlotAvailability, listExperienceBookings, listExperienceBookingsForSite, listExperiences, listSlotOverrides, resolveExperienceTimezone, updateBookingStatus, updateExperience, upsertSlotOverride, type CreateExperienceInput, type UpdateExperienceInput } from '~/server/utils/experiences'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { attachViewUrlToRecord, NOT_HANDLED, expandSlotGeneratorArgs, mutationContextPayload, omit, optionalDaysWindow, optionalString, requiredString } from './shared'
import { getGuestThreadBySubmission, updateThreadProjection } from '~/server/domain/guest-threads/repository'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'

function attachExperienceViewUrl(experience: object, site: McpExecutorContext["site"]) {
  const experienceRecord = experience as Record<string, unknown>;
  const slug = typeof experienceRecord.slug === "string" ? experienceRecord.slug.trim() : "";
  return attachViewUrlToRecord(experience, site, {
    publicPath: slug ? `/experiences/${slug}` : null,
  }, site.env);
}

export async function handleExperiencesTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_experiences":
      {
        const experiences = (await listExperiences(site.db, site.siteId, {
          locationId: optionalString(args, "location_id") ?? undefined,
        })).map((experience) => attachExperienceViewUrl(experience, site));
        const page = paginateMcpCollection(experiences, args, { resource: `experiences:${site.siteId}:${optionalString(args, 'location_id') ?? ''}` });
        return { experiences: page.items, page_info: page.page_info };
      }
    case "get_experience":
      {
        const experience = await getExperienceById(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
        );
        return {
          experience: experience ? attachExperienceViewUrl(experience, site) : null,
        };
      }
    case "create_experience": {
      const ceArgs = expandSlotGeneratorArgs(args as Record<string, unknown>);
      const locationId = requiredString(ceArgs, "location_id");
      const experience = await createExperience(
          site.db,
          site.organizationId,
          site.siteId,
          {
            ...(ceArgs as unknown as CreateExperienceInput),
            location_id: locationId,
          },
          site.userId,
          site.env,
        );
      const hydrated = attachExperienceViewUrl(experience, site);
      const context = await mutationContextPayload(site, { locationId });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "experience",
          id: experience.id,
          slug: experience.slug,
          public_url: hydrated.public_url,
          updated_at: experience.updated_at,
          context,
        },
        `Created experience "${experience.title}".`,
        { experience: hydrated },
      );
    }
    case "update_experience": {
      const ueArgs = expandSlotGeneratorArgs(omit(args, ["experience_id"]) as Record<string, unknown>);
      const experience = await updateExperience(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          {
            ...(ueArgs as unknown as UpdateExperienceInput),
          },
          site.env,
        );
      if (!experience) {
        return renderStructuredResponse(
          { ok: false, entity: "experience", id: requiredString(args, "experience_id") },
          "No experience found with that id or slug — nothing was changed.",
        );
      }
      const hydrated = attachExperienceViewUrl(experience, site);
      const context = await mutationContextPayload(site, { locationId: experience.location_id });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "experience",
          id: experience.id,
          slug: experience.slug,
          changed_fields: Object.keys(omit(args, ["experience_id"])),
          updated_at: experience.updated_at,
          context,
        },
        `Updated "${experience.title}".`,
        { experience: hydrated },
      );
    }
    case "delete_experience":
      return {
        deleted: await deleteExperience(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          { locationId: optionalString(args, "location_id") ?? null },
        ),
        context: await mutationContextPayload(site),
      };
    case "list_experience_bookings":
      {
        const experienceId = requiredString(args, "experience_id");
        const locationId = optionalString(args, "location_id") ?? null;
        const bookings = await listExperienceBookings(
          site.db,
          site.siteId,
          experienceId,
          { locationId },
        );
        const page = paginateMcpCollection(bookings, args, { resource: `experience-bookings:${site.siteId}:${experienceId}:${locationId ?? ''}` });
        return { bookings: page.items, page_info: page.page_info };
      }
    case "list_all_experience_bookings": {
      const [bookings, summary] = await Promise.all([
        listExperienceBookingsForSite(site.db, site.siteId, {
          locationId: optionalString(args, "location_id") ?? null,
          sinceDays: optionalDaysWindow(args, "days"),
        }),
        getExperienceBookingsSummary(site.db, site.siteId, {
          locationId: optionalString(args, "location_id") ?? null,
          sinceDays: optionalDaysWindow(args, "days"),
        }),
      ]);
      const page = paginateMcpCollection(bookings, args, { resource: `all-experience-bookings:${site.siteId}:${optionalString(args, 'location_id') ?? ''}:${optionalDaysWindow(args, 'days') ?? ''}` });
      return { bookings: page.items, summary, page_info: page.page_info };
    }
    case "update_experience_booking": {
      const bookingId = requiredString(args, "booking_id")
      const status = requiredString(args, "status") as "pending" | "confirmed" | "cancelled"
      const updated = await updateBookingStatus(
        site.db,
        site.siteId,
        requiredString(args, "experience_id"),
        bookingId,
        status,
      )
      if (updated) {
        const thread = await getGuestThreadBySubmission(site.db, 'experience_booking', bookingId)
        if (thread) {
          await updateThreadProjection(site.db, thread.id, {})
          await publishGuestInboxThreadEvent(site.env, site.db, { threadId: thread.id, type: 'thread.changed' })
        }
      }
      return {
        booking: updated,
        context: await mutationContextPayload(site),
      };
    }
    case "get_experience_availability": {
      const experienceId = requiredString(args, "experience_id");
      const experience = await getExperienceById(site.db, site.siteId, experienceId);
      if (!experience) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "Experience not found.");
      }
      const startDate = requiredString(args, "date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "Date must be YYYY-MM-DD format");
      }
      const parsedDate = new Date(`${startDate}T00:00:00Z`);
      if (isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== startDate) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "Invalid calendar date");
      }
      const daysRaw = (args as Record<string, unknown>).days;
      if (daysRaw !== undefined && (typeof daysRaw !== "number" || !Number.isInteger(daysRaw))) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "days must be an integer");
      }
      const days = Math.min(Math.max(typeof daysRaw === "number" ? daysRaw : 1, 1), 31);
      const timezone = await resolveExperienceTimezone(site.db, site.organizationId, site.siteId, experience);
      const cursor = new Date(`${startDate}T00:00:00Z`);
      const dateStrs: string[] = [];
      for (let i = 0; i < days; i++) {
        dateStrs.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      const dates = await Promise.all(
        dateStrs.map(async (dateStr) => ({
          date: dateStr,
          slots: await getSlotAvailability(site.db, site.siteId, experience, dateStr, timezone),
        })),
      );
      return { dates };
    }
    case "set_experience_slot_override":
      return {
        override: await upsertSlotOverride(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "experience_id"),
          {
            override_date: requiredString(args, "date"),
            time_slot: requiredString(args, "time_slot"),
            status: requiredString(args, "status") as "closed" | "open",
            capacity_override: typeof (args as Record<string, unknown>).capacity_override === "number"
              ? ((args as Record<string, unknown>).capacity_override as number)
              : null,
            note: optionalString(args, "note") ?? null,
          },
          site.userId,
        ),
      };
    case "list_experience_slot_overrides":
      return {
        overrides: await listSlotOverrides(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          {
            fromDate: optionalString(args, "from") ?? undefined,
            toDate: optionalString(args, "to") ?? undefined,
          },
        ),
      };
    default:
      return NOT_HANDLED
  }
}
