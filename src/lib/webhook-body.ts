// Peach's Checkout webhooks are documented as x-www-form-urlencoded; the
// Payouts webhook content type wasn't confirmed, so this accepts either.
export function parseWebhookBody(rawBody: string, contentType: string | null): Record<string, unknown> {
  if (contentType?.includes("application/json")) {
    try {
      return JSON.parse(rawBody);
    } catch {
      // fall through to form parsing
    }
  }
  return Object.fromEntries(new URLSearchParams(rawBody));
}
