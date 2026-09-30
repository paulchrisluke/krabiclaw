import { HTTPError } from 'nitro'
import type { McpExecutorContext } from './shared'
import { getLocation, updateLocation, type LocationRecord } from '~/server/utils/location-management'
import { AGENDA_KINDS, listAgenda, type AgendaKind } from '~/server/utils/dashboard-agenda'
import { closeDates, closureOnDate, datedHours, getDateIntervals, openDates } from '~/shared/reservation-hours'
import { addLocalDays, assertCalendarDate, formatCalendarDate } from '~/utils/timezone'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, omit, optionalString, requiredString, workspaceLocationsPayload } from './shared'

type LoadedLocation = NonNullable<Awaited<ReturnType<typeof getLocation>>>

async function requireLocation(organization: McpExecutorContext['organization'], locationIdOrSlug: string): Promise<LoadedLocation> {
  const location = await getLocation(organization.db, organization.organizationId, locationIdOrSlug);
  if (!location) throw new HTTPError({ statusCode: 404, statusMessage: `Location "${locationIdOrSlug}" was not found.` });
  return location;
}

export async function handleLocationsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, organization } = ctx
  switch (toolName) {
    case "list_locations": {
      const workspace = await resolveMcpWorkspace(
        organization.db,
        organization.env,
        organization.userId,
        { organizationId: organization.organizationId },
      );
      const page = paginateMcpCollection(workspaceLocationsPayload(workspace), args, { resource: `locations:${organization.organizationId}` });
      return {
        context: workspaceContextPayload(workspace.organization, workspace.location),
        locations: page.items,
        page_info: page.page_info,
      };
    }
    case "get_location":
      {
        const locationId = requiredString(args, "location_id");
        return {
          location: await getLocation(
          organization.db,
          organization.organizationId,
            locationId,
          ),
          context: await mutationContextPayload(organization, { locationId }),
        };
      }
    case "update_location": {
      const locationId = requiredString(args, "location_id");
      const updateFields = omit(args, ["location_id"]) as Record<string, unknown>;
      const result = await updateLocation(
        organization.db,
        organization.organizationId,
        locationId,
        updateFields as never,
        organization.userId,
        organization.env,
      );
      assertDomainSuccess(result);
      const updatedLocation = (result.data as { location: LocationRecord }).location;
      const updateContext = await mutationContextPayload(organization, { locationId });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "location",
          id: updatedLocation.id,
          slug: updatedLocation.slug,
          changed_fields: Object.keys(omit(args, ["location_id"])),
          updated_at: updatedLocation.updated_at,
          context: updateContext,
        },
        `Updated "${updatedLocation.title}".`,
        { ...result.data, context: updateContext },
      );
    }
    // The calendar's read, as the dashboard draws it: the agenda for the days,
    // and which days the location cannot take, from the same hours helpers.
    case "get_calendar": {
      const location = await requireLocation(organization, requiredString(args, "location_id"));
      const from = requiredString(args, "from");
      const to = requiredString(args, "to");
      assertCalendarDate(from);
      assertCalendarDate(to);
      if (to < from) throw new Error("to must not be before from");
      const days: string[] = [];
      for (let day = from; day <= to; day = addLocalDays(day, 1)) {
        days.push(day);
        if (days.length > 62) throw new Error("get_calendar covers at most 62 days per call");
      }
      const requested = Array.isArray(args.kinds)
        ? args.kinds.filter((kind): kind is AgendaKind => AGENDA_KINDS.includes(kind as AgendaKind))
        : undefined;
      const agenda = await listAgenda(organization.db, organization.organizationId, {
        from, to, locationId: location.id, kinds: requested, organizationSlug: organization.organizationSlug,
        principal: { env: organization.env, membership: organization.membership },
      });
      const unavailable = days.flatMap((date) => {
        if (location.status !== "active") return [{ date, reason: "This location is not active." }];
        const closure = closureOnDate(location.special_hours, date);
        if (closure) return [{ date, reason: closure.note || "Closed by you." }];
        const dated = datedHours(location.special_hours, date);
        if (dated?.kind === "hours" && dated.periods.length === 0) return [{ date, reason: dated.note || "Closed by you." }];
        const intervals = getDateIntervals(location.opening_hours, location.special_hours, date);
        return intervals !== null && intervals.length === 0 ? [{ date, reason: `Closed on ${formatCalendarDate(date, "en", { weekday: "long" })}s in your hours.` }] : [];
      });
      return {
        items: agenda.items,
        available_kinds: agenda.availableKinds,
        unavailable_dates: unavailable,
        context: await mutationContextPayload(organization, { locationId: location.id }),
      };
    }
    // Block and Open are the calendar's two writes, through the one helpers
    // the calendar uses, onto the one field the hours leaf edits.
    case "block_dates":
    case "open_dates": {
      const locationIdOrSlug = requiredString(args, "location_id");
      const from = requiredString(args, "from");
      const to = requiredString(args, "to");
      const note = toolName === "block_dates" ? optionalString(args, "note") ?? null : null;
      // The write names the row it read. If the location moved in between,
      // the row is read again and the range applied to what is there now —
      // once; a second refusal is reported.
      let result: Awaited<ReturnType<typeof updateLocation>> | null = null;
      let location = await requireLocation(organization, locationIdOrSlug);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const special = toolName === "block_dates"
          ? closeDates(location.special_hours, from, to)
          : openDates(location.special_hours, from, to);
        const withNote = note && special ? special.map((entry, index) => index === special.length - 1 && entry.kind === "closure" ? { ...entry, note } : entry) : special;
        result = await updateLocation(
          organization.db,
          organization.organizationId,
          location.id,
          { special_hours: withNote, expected_updated_at: location.updated_at } as never,
          organization.userId,
          organization.env,
        );
        if (result.status !== 409) break;
        location = await requireLocation(organization, location.id);
      }
      assertDomainSuccess(result!);
      const updated = (result!.data as { location: LocationRecord }).location;
      const context = await mutationContextPayload(organization, { locationId: location.id });
      const span = from === to ? from : `${from} to ${to}`;
      return renderStructuredResponse(
        {
          ok: true,
          entity: "location",
          id: updated.id,
          slug: updated.slug,
          changed_fields: ["special_hours"],
          updated_at: updated.updated_at,
          context,
        },
        toolName === "block_dates" ? `Blocked ${span} at "${updated.title}".` : `Opened ${span} at "${updated.title}".`,
        { ...result!.data, context },
      );
    }
    default:
      return NOT_HANDLED
  }
}
