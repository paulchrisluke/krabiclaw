export const PLATFORM_ROUTE_PREFIXES = [
  "/docs",
  "/blog",
  "/login",
  "/signup",
  "/pricing",
  "/dashboard",
  "/api",
  "/admin",
  "/auth",
  "/oauth",
  "/templates",
  "/features",
  "/privacy",
  "/terms",
  "/.well-known",
];

export function isPlatformPath(pathname: string): boolean {
  return PLATFORM_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}
