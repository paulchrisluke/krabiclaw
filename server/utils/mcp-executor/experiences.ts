import type { McpExecutorContext } from './shared'
import { createExperience, deleteExperience, getExperienceBookingsSummary, getExperienceById, listExperienceBookings, listExperienceBookingsForSite, listExperiences, updateBookingStatus, updateExperience, type CreateExperienceInput, type UpdateExperienceInput } from '~/server/utils/experiences'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { attachViewUrlToRecord, NOT_HANDLED, expandSlotGeneratorArgs, mutationContextPayload, omit, optionalDaysWindow, optionalString, requiredString } from './shared'
import { getGuestThreadBySubmission } from '~/server/domain/guest-threads/repository'
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
          await publishGuestInboxThreadEvent(site.env, site.db, { threadId: thread.id, type: 'thread.changed' })
        }
      }
      return {
        booking: updated,
        context: await mutationContextPayload(site),
      };
    }
    default:
      return NOT_HANDLED
  }
}
