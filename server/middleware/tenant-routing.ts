// Tenant routing middleware based on onboarding status
// Routes tenant requests to appropriate pages

import { HTTPError, defineHandler  } from 'nitro';
import { redirect } from 'nitro/h3';
import type { H3Event } from 'nitro';
import { cloudflareEnv } from "~/server/utils/api-response";
import { platformHostname } from "~/server/utils/domains";
import { TENANT_TYPES } from "~/utils/tenant-routing";
import { queryFirst } from "~/server/db";

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
    if (!pathname.startsWith('/api/')) {
      const env = cloudflareEnv(event)
      const db = env.db
      if (db) {
        const host = (event.req.headers.get('host') || '').split(':')[0]
        const spent = await queryFirst<{
          successor_domain: string | null
        }>(db, `SELECT successor_domain FROM spent_subdomains WHERE domain = ? LIMIT 1`, [host])
        if (spent) {
          if (spent.successor_domain) {
            return redirect(`https://${spent.successor_domain}${url.pathname}${url.search}`, 301)
          }
          throw new HTTPError({ statusCode: 410, statusMessage: 'Gone' })
        }
      }
    }

    if (shouldRenderWithNuxtErrorPage(event, pathname)) {
      return;
    }

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
        if (shouldRenderWithNuxtErrorPage(event, pathname)) {
          event.context.tenantType = TENANT_TYPES.TENANT_404;
          return;
        }

        throw new HTTPError({
          statusCode: 404,
          statusMessage: "Site Not Found",
        });
    }
  }
});

function shouldRenderWithNuxtErrorPage(
  event: H3Event,
  pathname: string,
) {
  if (event.method !== "GET") return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/_nuxt/") || pathname.startsWith("/assets/") || pathname.startsWith("/_ipx/")) return false;

  const secFetchDest = (event.req.headers.get("sec-fetch-dest"));
  if (secFetchDest === "document") return true;

  const accept = (event.req.headers.get("accept")) || "";
  return accept.includes("text/html");
}
