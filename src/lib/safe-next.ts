/**
 * Where to send someone after they sign in or confirm their email.
 * Only same-site paths are allowed. "//evil.com" and "/\evil.com" start
 * with "/" but browsers treat them as links to another site, so they are
 * rejected along with anything absolute.
 */
export function safeNext(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
