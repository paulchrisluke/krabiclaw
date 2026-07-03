// GET /api/admin/feature-flags — platform admin reads platform-wide UI flags
import { cloudflareEnv, jsonResponse } from "~/server/utils/api-response";
import { getAuthSession } from "~/server/utils/auth";
import { isPlatformAdmin } from "~/server/utils/platform-auth";
import { isManagedServiceEnabled } from "~/server/utils/feature-flags";

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event);

  const session = await getAuthSession(event, env);
  if (!session?.user?.email)
    return jsonResponse({ error: "Authentication required" }, { status: 401 });
  if (!isPlatformAdmin(session.user, env))
    return jsonResponse(
      { error: "Platform admin access required" },
      { status: 403 },
    );

  return jsonResponse({ managedServiceEnabled: isManagedServiceEnabled(env) });
});
