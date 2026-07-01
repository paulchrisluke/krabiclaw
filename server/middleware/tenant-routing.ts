// Tenant routing middleware based on onboarding status
// Routes tenant requests to appropriate pages

import { createError, defineEventHandler, getHeader, getRequestURL, sendRedirect } from "h3";
import { cloudflareEnv } from "~/server/utils/api-response";
import { platformHostname } from "~/server/utils/domains";
import { TENANT_TYPES } from "~/utils/tenant-routing";

export default defineEventHandler(async (event) => {
  const tenantType = event.context.tenantType;
  const onboardingStatus = event.context.onboardingStatus;
  const url = getRequestURL(event);
  const pathname = url.pathname;

  // Only process tenant requests
  if (!tenantType?.startsWith("tenant")) {
    return;
  }

  // Handle unknown tenant (404)
  if (tenantType === TENANT_TYPES.TENANT_404) {
    if (shouldRenderWithNuxtErrorPage(event, pathname)) {
      return;
    }

    throw createError({
      statusCode: 404,
      statusMessage: "Site Not Found",
    });
  }

  // Handle tenant sites based on onboarding status
  if (tenantType === TENANT_TYPES.TENANT) {
    switch (onboardingStatus) {
      case "pending":
        return sendRedirect(event, "/tenant-setup-pending");

      case "failed":
        return sendRedirect(event, "/tenant-setup-incomplete");

      case "active": {
        const env = cloudflareEnv(event);
        const freeDomain = env.NUXT_PUBLIC_FREE_SITE_DOMAIN
          ? platformHostname(env)
          : "krabiclaw.com";
        const canonicalIsCustom =
          event.context.canonicalDomain &&
          !event.context.canonicalDomain.endsWith(`.${freeDomain}`);

        const hostMismatch =
          canonicalIsCustom &&
          event.context.tenantHost &&
          event.context.tenantHost !== event.context.canonicalDomain;

        if (
          hostMismatch &&
          event.context.canonicalDomain &&
          !pathname.startsWith("/api/")
        ) {
          return sendRedirect(
            event,
            `https://${event.context.canonicalDomain}${url.pathname}${url.search}`,
            301,
          );
        }
        // Let the request continue to render the Saya site
        return;
      }

      default:
        if (shouldRenderWithNuxtErrorPage(event, pathname)) {
          event.context.tenantType = TENANT_TYPES.TENANT_404;
          return;
        }

        throw createError({
          statusCode: 404,
          statusMessage: "Site Not Found",
        });
    }
  }
});

function shouldRenderWithNuxtErrorPage(
  event: Parameters<typeof defineEventHandler>[0] extends (event: infer T) => unknown ? T : never,
  pathname: string,
) {
  if (event.method !== "GET") return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/_nuxt/") || pathname.startsWith("/assets/") || pathname.startsWith("/_ipx/")) return false;

  const secFetchDest = getHeader(event, "sec-fetch-dest");
  if (secFetchDest === "document") return true;

  const accept = getHeader(event, "accept") || "";
  return accept.includes("text/html");
}
