// GET /api/admin/feature-flags — platform admin reads platform-wide UI flags
import { cloudflareEnv, jsonResponse } from "~/server/utils/api-response";
import { isManagedServiceEnabled } from "~/server/utils/feature-flags";
import { platformPermissionJsonResponse } from "~/server/utils/platform-admin-users";

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event);

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ["access"] });
  if (permissionDenied) return permissionDenied;

  return jsonResponse({ managedServiceEnabled: isManagedServiceEnabled(env) });
});
