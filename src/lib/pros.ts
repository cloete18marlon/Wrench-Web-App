import type { SupabaseClient } from "@supabase/supabase-js";
import { VERIFIED_MIN_TIER } from "./badges";

export const TRADE_EMOJI: Record<string, string> = {
  Painting: "🎨",
  Electrical: "⚡",
  Plumbing: "🚰",
  Carpentry: "🪚",
  Landscaping: "🌿",
  Cleaning: "🧹",
  Tiling: "🧱",
  Roofing: "🏠",
};

export type ProCard = {
  id: string;
  name: string;
  company: string | null;
  avatarUrl: string | null;
  bio: string | null;
  hourlyRate: number | null;
  tier: number;
  trades: { id: string; name: string }[];
  skills: string[];
  rating: number | null;
  reviewCount: number;
};

export type DirectoryFilters = {
  q: string;
  trade: string; // trade name, or "" for all
  minRating: number; // 0 = any
  maxRate: number; // 0 = any
  verifiedOnly: boolean;
  sort: "best" | "rating" | "priceLow" | "priceHigh";
  page: number;
};

export const PAGE_SIZE = 20;

const SORTS = ["best", "rating", "priceLow", "priceHigh"] as const;

/** Parse untrusted query-string values into safe filter values. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): DirectoryFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const num = (k: string) => {
    const n = Number(one(k));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const sort = one("sort") as DirectoryFilters["sort"];
  return {
    q: one("q").trim().slice(0, 80),
    trade: one("trade").slice(0, 40),
    minRating: Math.min(num("minRating"), 5),
    maxRate: num("maxRate"),
    verifiedOnly: one("verified") === "1",
    sort: SORTS.includes(sort) ? sort : "best",
    page: Math.max(1, Math.floor(num("page")) || 1),
  };
}

// Only columns granted to anon (see migration 20260925). Selecting a column
// that isn't granted - location, for instance - fails the whole query.
const CARD_SELECT =
  "id, display_name, company_name, avatar_url, bio, hourly_rate, verification_tier, " +
  "pro_trades(trades(id, name)), pro_skills(skills(name)), reviews(rating)";

type Row = {
  id: string;
  display_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  hourly_rate: number | string | null;
  verification_tier: number;
  pro_trades: { trades: { id: string; name: string } | null }[] | null;
  pro_skills: { skills: { name: string } | null }[] | null;
  reviews: { rating: number }[] | null;
};

function toCard(r: Row): ProCard {
  const ratings = (r.reviews ?? []).map((x) => Number(x.rating)).filter((n) => n > 0);
  return {
    id: r.id,
    name: r.display_name || r.company_name || "Wrenchy pro",
    company: r.company_name,
    avatarUrl: r.avatar_url,
    bio: r.bio,
    hourlyRate: r.hourly_rate === null ? null : Number(r.hourly_rate),
    tier: r.verification_tier,
    trades: (r.pro_trades ?? []).map((t) => t.trades).filter((t): t is { id: string; name: string } => !!t),
    skills: (r.pro_skills ?? []).map((s) => s.skills?.name).filter((s): s is string => !!s),
    rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    reviewCount: ratings.length,
  };
}

/**
 * All approved pros. The explicit tier filter matters even though RLS also
 * applies it for guests: admins and applicants can read tier-0 profiles
 * through their own policies, and the directory must never show those.
 */
export async function fetchApprovedPros(supabase: SupabaseClient): Promise<ProCard[]> {
  const { data, error } = await supabase
    .from("pro_profiles")
    .select(CARD_SELECT)
    .gte("verification_tier", 1)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(toCard);
}

export async function fetchApprovedPro(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("pro_profiles")
    .select(CARD_SELECT.replace("reviews(rating)", "reviews(rating, comment, created_at)") + ", service_radius_km")
    .eq("id", id)
    .gte("verification_tier", 1)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as Omit<Row, "reviews"> & {
    service_radius_km: number | string;
    reviews: { rating: number; comment: string | null; created_at: string }[] | null;
  };
  return {
    ...toCard(row),
    serviceRadiusKm: Number(row.service_radius_km),
    reviews: (row.reviews ?? [])
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

/**
 * The prototype's applyFilters(), minus distance. Runs on the server, so no
 * filtering logic or unapproved data reaches the browser. It filters in
 * application code rather than SQL, which is fine at pilot volume; move it
 * into a database function when the directory passes a few hundred pros.
 */
export function applyFilters(pros: ProCard[], f: DirectoryFilters): ProCard[] {
  const q = f.q.toLowerCase();
  const list = pros.filter((p) => {
    if (f.trade && !p.trades.some((t) => t.name === f.trade)) return false;
    if (f.minRating && (p.rating ?? 0) < f.minRating) return false;
    if (f.maxRate && (p.hourlyRate ?? Infinity) > f.maxRate) return false;
    if (f.verifiedOnly && p.tier < VERIFIED_MIN_TIER) return false;
    if (q) {
      const haystack = [p.name, p.company ?? "", ...p.trades.map((t) => t.name), ...p.skills]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const rate = (p: ProCard, missing: number) => p.hourlyRate ?? missing;
  switch (f.sort) {
    case "rating":
      return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount);
    case "priceLow":
      return list.sort((a, b) => rate(a, Infinity) - rate(b, Infinity));
    case "priceHigh":
      return list.sort((a, b) => rate(b, -1) - rate(a, -1));
    default:
      // Best match: higher verification first, then rating, then review volume.
      return list.sort(
        (a, b) =>
          b.tier - a.tier || (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount
      );
  }
}

/** Build a /pros URL from filters, dropping defaults so links stay short. */
export function directoryHref(f: Partial<DirectoryFilters>): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.trade) p.set("trade", f.trade);
  if (f.minRating) p.set("minRating", String(f.minRating));
  if (f.maxRate) p.set("maxRate", String(f.maxRate));
  if (f.verifiedOnly) p.set("verified", "1");
  if (f.sort && f.sort !== "best") p.set("sort", f.sort);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `/pros?${s}` : "/pros";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
