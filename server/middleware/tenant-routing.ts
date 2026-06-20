// Tenant routing middleware based on onboarding status
// Routes tenant requests to appropriate pages

import { defineEventHandler, getRequestURL, sendRedirect } from "h3";
import { cloudflareEnv } from "~/server/utils/api-response";
import { platformHostname } from "~/server/utils/domains";

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
  if (tenantType === "tenant-404") {
    event.node.res.statusCode = 404;
    if (pathname === "/tenant-404") {
      return;
    }
    return sendRedirect(event, "/tenant-404");
  }

  // Handle tenant sites based on onboarding status
  if (tenantType === "tenant") {
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

        // Derive protocol from x-forwarded-proto, socket, or default to https.
        // Cloudflare for SaaS custom hostnames have no edge-level "Always Use
        // HTTPS" enforcement (that zone setting only covers krabiclaw.com's own
        // hostnames), so the Worker must force the upgrade itself.
        let protocol = "https";
        const xfProto = event.node.req.headers["x-forwarded-proto"];
        if (typeof xfProto === "string") {
          const proto = xfProto?.split(",")[0]?.trim()?.toLowerCase();
          protocol = proto === "http" || proto === "https" ? proto : "https";
        } else if (event.node.req.socket && 'encrypted' in event.node.req.socket && (event.node.req.socket as { encrypted?: boolean }).encrypted)
          protocol = "https";
        else if (event.node.req.socket) protocol = "http";
        // Optionally allow override via env/config (validate)
        if (env.DEFAULT_PROTOCOL) {
          const envProto = env.DEFAULT_PROTOCOL.toLowerCase();
          protocol =
            envProto === "http" || envProto === "https" ? envProto : protocol;
        }

        const hostMismatch =
          canonicalIsCustom &&
          event.context.tenantHost &&
          event.context.tenantHost !== event.context.canonicalDomain;

        if (
          (hostMismatch || protocol === "http") &&
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
        // Unknown status, treat as 404
        event.node.res.statusCode = 404;
        return sendRedirect(event, "/tenant-404");
    }
  }
});
