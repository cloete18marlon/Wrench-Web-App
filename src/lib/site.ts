// Used to build absolute redirect URLs for auth emails (signup confirmation,
// OAuth). Set NEXT_PUBLIC_SITE_URL in each deploy environment (Netlify site
// settings) — without it, confirmation links would point at localhost.
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  ""
);
