// Tenant routing middleware based on onboarding status
// Routes tenant requests to appropriate pages

import { HTTPError, defineHandler  } from 'nitro';
import { redirect } from 'nitro/h3';
import { cloudflareEnv } from "~/server/utils/api-response";
import { platformHostname } from "~/server/utils/domains";
import { TENANT_TYPES } from "~/utils/tenant-routing";

export default defineHandler(async (event) => {
  const tenantType = event.context.tenantType as string | undefined;
  const onboardingStatus = event.context.onboardingStatus as string | undefined;
  const url = event.url;
  const pathname = url.pathname;

  // Only process tenant requests
  if (!tenantType?.startsWith("tenant")) {
    return;
  }

  // Handle unknown tenant (404)
  if (tenantType === TENANT_TYPES.TENANT_404) {
    throw new HTTPError({
      statusCode: 404,
      statusMessage: "Site Not Found",
    });
  }

  // Handle tenant sites based on onboarding status
  if (tenantType === TENANT_TYPES.TENANT) {
    switch (onboardingStatus) {
      case "pending":
        return redirect("/tenant-setup-pending", 302);

      case "failed":
        return redirect("/tenant-setup-incomplete", 302);

      case "active": {
        const env = cloudflareEnv(event);
        const freeDomain = platformHostname(env);
        const canonicalIsCustom =
          event.context.canonicalDomain &&
          !String(event.context.canonicalDomain).endsWith(`.${freeDomain}`);

        const hostMismatch =
          canonicalIsCustom &&
          event.context.tenantHost &&
          event.context.tenantHost !== event.context.canonicalDomain;

        if (
          hostMismatch &&
          event.context.canonicalDomain &&
          !pathname.startsWith("/api/")
        ) {
          return redirect(
            `https://${event.context.canonicalDomain}${url.pathname}${url.search}`,
            301,
          );
        }
        // Let the request continue to render the Saya site
        return;
      }

      default:
        throw new HTTPError({
          statusCode: 404,
          statusMessage: "Site Not Found",
        });
    }
  }
});
