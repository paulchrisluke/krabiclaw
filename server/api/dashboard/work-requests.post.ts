// POST /api/dashboard/work-requests — managed client submits a work request
import { cloudflareEnv, jsonResponse } from "~/server/utils/api-response";
import { getDashboardContext } from "~/server/utils/dashboard-context";
import { hasEntitlement } from "~/server/utils/billing";

type WorkRequestType =
  | "content_update"
  | "menu_update"
  | "translation"
  | "seo"
  | "google_business"
  | "seasonal"
  | "photo_update"
  | "social_media"
  | "technical"
  | "other";
type Priority = "low" | "normal" | "high" | "urgent";

const VALID_TYPES: WorkRequestType[] = [
  "content_update",
  "menu_update",
  "translation",
  "seo",
  "google_business",
  "seasonal",
  "photo_update",
  "social_media",
  "technical",
  "other",
];
const VALID_PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event);
  const { db, organization, restaurant } = await getDashboardContext(event, {
    requireRestaurant: false,
  });

  // Canonical entitlement check
  if (!(await hasEntitlement(env, db, organization.id, "work_requests"))) {
    return jsonResponse(
      { error: "Work requests require a Growth plan or above." },
      { status: 403 },
    );
  }

  const body = (await readBody(event).catch(() => ({}))) as {
    type?: string;
    title?: string;
    description?: string;
    priority?: string;
    source?: string;
  };

  const type = body.type as WorkRequestType;
  const title = body.title?.trim();
  const description = body.description?.trim() || null;
  const priority = (body.priority as Priority) ?? "normal";
  const source =
    body.source === "chowbot"
      ? "chowbot"
      : body.source === "whatsapp"
        ? "whatsapp"
        : "dashboard";

  if (!type || !VALID_TYPES.includes(type)) {
    return jsonResponse(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (!title)
    return jsonResponse({ error: "Title is required" }, { status: 400 });
  if (!VALID_PRIORITIES.includes(priority))
    return jsonResponse({ error: "Invalid priority" }, { status: 400 });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `
    INSERT INTO work_requests (id, organization_id, site_id, type, title, description, priority, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .bind(
      id,
      organization.id,
      restaurant?.id ?? null,
      type,
      title,
      description,
      priority,
      source,
      now,
      now,
    )
    .run();

  return jsonResponse({ success: true, id });
});
