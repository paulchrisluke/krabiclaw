import type { McpExecutorContext } from './shared'
import { createExperience, deleteExperience, getExperienceBookingsSummary, getExperienceById, getSlotAvailability, listExperienceBookings, listExperienceBookingsForSite, listExperiences, listSlotOverrides, resolveExperienceTimezone, updateBookingStatus, updateExperience, upsertSlotOverride, type CreateExperienceInput, type UpdateExperienceInput } from '~/server/utils/experiences'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { loadSettingsPayload, SiteNotFoundError } from '~/server/utils/site-settings'
import { attachViewUrlToRecord, NOT_HANDLED, expandSlotGeneratorArgs, mutationContextPayload, objectArray, omit, optionalDaysWindow, optionalString, requiredString } from './shared'

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
      return {
        experiences: (await listExperiences(site.db, site.siteId, {
          locationId: optionalString(args, "location_id") ?? undefined,
        })).map((experience) => attachExperienceViewUrl(experience, site)),
      };
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
      const priceAmountRaw = ceArgs.price_amount;
      if (priceAmountRaw !== undefined && priceAmountRaw !== null && typeof priceAmountRaw !== "number") {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "price_amount must be a number or null");
      }
      const compareAtPriceAmountRaw = ceArgs.compare_at_price_amount;
      if (compareAtPriceAmountRaw !== undefined && compareAtPriceAmountRaw !== null && typeof compareAtPriceAmountRaw !== "number") {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "compare_at_price_amount must be a number or null");
      }
      let locationId = ceArgs.location_id ? String(ceArgs.location_id) : null;
      if (!locationId) {
        try {
          const siteRow = (await loadSettingsPayload(site.db, site.organizationId, site.siteId)) as Record<string, unknown>;
          locationId = (siteRow.primary_location_id as string | null) ?? null;
        } catch (err) {
          if (err instanceof SiteNotFoundError) {
            throw mcpProtocolError(MCP_ERROR.invalidParams, "Site not found");
          }
          throw err;
        }
      }
      if (!locationId) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "location_id is required because this site does not have a primary location yet. Call list_locations or create_location first, then retry create_experience with that location_id.",
        );
      }
      const experience = await createExperience(
          site.db,
          site.organizationId,
          site.siteId,
          {
            ...(ceArgs as unknown as CreateExperienceInput),
            location_id: locationId,
            price_amount: typeof priceAmountRaw === "number" ? priceAmountRaw : null,
            compare_at_price_amount: typeof compareAtPriceAmountRaw === "number" ? compareAtPriceAmountRaw : null,
          },
          site.userId,
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
      const priceAmountRaw = ueArgs.price_amount;
      if (priceAmountRaw !== undefined && priceAmountRaw !== null && typeof priceAmountRaw !== "number") {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "price_amount must be a number or null");
      }
      const compareAtPriceAmountRaw = ueArgs.compare_at_price_amount;
      if (compareAtPriceAmountRaw !== undefined && compareAtPriceAmountRaw !== null && typeof compareAtPriceAmountRaw !== "number") {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "compare_at_price_amount must be a number or null");
      }
      const experience = await updateExperience(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          {
            ...(ueArgs as unknown as UpdateExperienceInput),
            ...(priceAmountRaw !== undefined
              ? { price_amount: typeof priceAmountRaw === "number" ? priceAmountRaw : null }
              : {}),
            ...(compareAtPriceAmountRaw !== undefined
              ? { compare_at_price_amount: typeof compareAtPriceAmountRaw === "number" ? compareAtPriceAmountRaw : null }
              : {}),
          },
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
    case "set_experience_media": {
      const experience = await updateExperience(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          { media: objectArray(args.media, "media").map((item) => ({ asset_id: requiredString(item, "asset_id") })) },
        );
      if (!experience) {
        return renderStructuredResponse(
          { ok: false, entity: "experience", id: requiredString(args, "experience_id") },
          "No experience found with that id or slug — nothing was changed.",
        );
      }
      const hydratedMediaExperience = attachExperienceViewUrl(experience, site);
      const setMediaExperienceContext = await mutationContextPayload(site, { locationId: experience.location_id });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "experience",
          id: experience.id,
          slug: experience.slug,
          public_url: (hydratedMediaExperience as { public_url?: unknown }).public_url,
          changed_fields: ["media"],
          updated_at: experience.updated_at,
          context: setMediaExperienceContext,
        },
        `Updated media for "${experience.title}".`,
        { experience: hydratedMediaExperience },
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
      return {
        bookings: await listExperienceBookings(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          { locationId: optionalString(args, "location_id") ?? null },
        ),
      };
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
      return {
        bookings,
        summary,
      };
    }
    case "update_experience_booking":
      return {
        booking: await updateBookingStatus(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          requiredString(args, "booking_id"),
          requiredString(args, "status") as
            | "pending"
            | "confirmed"
            | "cancelled",
        ),
        context: await mutationContextPayload(site),
      };
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
