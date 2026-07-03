export const PLATFORM_ROUTE_PREFIXES = [
  "/docs",
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
  "/accept-invitation",
  "/blog",
  "/contact",
  "/dev",
  "/experiences",
  "/locations",
  "/menu",
  "/preview",
  "/reservations",
  "/transfer",
];

export function isPlatformPath(pathname: string): boolean {
  return PLATFORM_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}
