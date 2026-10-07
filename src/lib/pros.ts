import type { SupabaseClient } from "@supabase/supabase-js";
import { VERIFIED_MIN_TIER } from "./badges";

/**
 * One icon per trade, keyed by trade name (must match trades.name exactly).
 * Every icon is unique, and all are from Emoji 13.0 (2020) or earlier so they
 * render on older Android and Windows. A trade missing from this map falls
 * back to 🔧, so add new trades here when they're added to the database.
 */
export const TRADE_EMOJI: Record<string, string> = {
  // Original eight (unchanged)
  Painting: "🎨",
  Electrical: "⚡",
  Plumbing: "🚰",
  Carpentry: "🪚",
  Landscaping: "🌿",
  Cleaning: "🧹",
  Tiling: "🧱",
  Roofing: "🏠",

  // Building & Structural
  "Asbestos Removal": "☣️",
  "Bricklaying & Building": "🏗️",
  "Ceilings & Drywall": "🪜",
  "Concrete & Screeding": "🪨",
  "Demolition & Site Clearing": "🚜",
  "Plastering & Skimming": "🪣",
  "Steel Fabrication & Welding": "🔩",
  "Waterproofing & Damp-proofing": "☔",

  // Electrical & Energy
  "Appliance Repair": "🔌",
  "CCTV, Alarms & Access Control": "📹",
  "Electric Fencing": "🚨",
  "Gate Motors & Garage Doors": "🚪",
  "Generator Installation & Servicing": "⛽",
  "Lighting Design & Installation": "💡",
  "Solar & Inverter Installation": "☀️",
  "TV, Satellite & Wi-Fi Installation": "📡",

  // Plumbing, Water & Gas
  "Boreholes, Pumps & Water Tanks": "💧",
  "Drain Unblocking & Sewer Work": "🪠",
  "Gas Installation": "🔥",
  "Geyser Installation & Repair": "♨️",
  Irrigation: "💦",
  "Water Filtration & Grey-water Systems": "♻️",

  // Finishing & Interiors
  "Blinds, Curtains & Shutters": "🪟",
  Flooring: "🪵",
  "Glazing & Shower Doors": "🪞",
  "Kitchen & Cupboard Installation": "🍳",
  Shopfitting: "🏪",
  Upholstery: "🛋️",
  Wallpapering: "📜",

  // Outdoor & Property
  "Burglar Bars & Security Gates": "🛡️",
  "Carports & Shade Ports": "🚗",
  "Decking & Pergolas": "🏡",
  Fencing: "🚧",
  "Gutters & Fascias": "🌧️",
  Paving: "🛣️",
  "Pool Building & Maintenance": "🏊",
  "Pressure Washing": "🚿",
  "Tree Felling & Tree Surgery": "🌳",

  // Cleaning & Hygiene
  "Carpet & Upholstery Cleaning": "🧽",
  "Mould Remediation": "🦠",
  "Pest Control & Fumigation": "🐜",
  "Rubble & Junk Removal": "🗑️",
  "Window Cleaning": "✨",

  // Mechanical & Specialist
  "Air Conditioning & Refrigeration": "❄️",
  "Fire Protection": "🧯",
  Handyman: "🧰",
  "Lifts & Escalators": "🛗",
  Locksmiths: "🔑",

  // Professional & Pre-build
  "Architectural Drafting": "📐",
  "Home Inspections & Compliance Certificates": "📋",
  "Interior Design": "🪴",
  "Quantity Surveying": "🧮",
  "Structural Engineering": "🏛️",

  // Moving & Assembly
  "Flat-pack Assembly": "📦",
  "Furniture Removals": "🚚",
  "Picture Hanging & Mounting": "🖼️",
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
  category: string; // trade category name, or "" for all
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
    // Names are checked against the real catalogue in resolveTradeFilters; the
    // limit only stops absurd input. It must exceed the longest trade name
    // ("Home Inspections & Compliance Certificates" is 42 characters).
    category: one("category").slice(0, 80),
    trade: one("trade").slice(0, 80),
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
export function applyFilters(
  pros: ProCard[],
  f: DirectoryFilters,
  catalog: TradeCatalog = { categories: [] }
): ProCard[] {
  const q = f.q.toLowerCase();
  const categoryTrades = f.category
    ? new Set(catalog.categories.find((c) => c.name === f.category)?.trades.map((t) => t.name) ?? [])
    : null;
  const list = pros.filter((p) => {
    if (categoryTrades && !p.trades.some((t) => categoryTrades.has(t.name))) return false;
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
  if (f.category) p.set("category", f.category);
  if (f.trade) p.set("trade", f.trade);
  if (f.minRating) p.set("minRating", String(f.minRating));
  if (f.maxRate) p.set("maxRate", String(f.maxRate));
  if (f.verifiedOnly) p.set("verified", "1");
  if (f.sort && f.sort !== "best") p.set("sort", f.sort);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `/pros?${s}` : "/pros";
}

export type TradeCategory = {
  id: string;
  name: string;
  trades: { id: string; name: string }[];
};

export type TradeCatalog = { categories: TradeCategory[] };

/**
 * Categories in display order, each with its trades sorted by name. Two plain
 * reads rather than an embedded select, so nothing depends on how PostgREST
 * names the trades -> trade_categories relationship.
 */
export async function fetchTradeCatalog(supabase: SupabaseClient): Promise<TradeCatalog> {
  const [cats, trades] = await Promise.all([
    supabase.from("trade_categories").select("id, name, sort_order").order("sort_order"),
    supabase.from("trades").select("id, name, category_id").order("name"),
  ]);
  if (cats.error) throw new Error(cats.error.message);
  if (trades.error) throw new Error(trades.error.message);
  const rows = (trades.data ?? []) as { id: string; name: string; category_id: string }[];
  return {
    categories: ((cats.data ?? []) as { id: string; name: string }[]).map((c) => ({
      id: c.id,
      name: c.name,
      trades: rows.filter((t) => t.category_id === c.id).map(({ id, name }) => ({ id, name })),
    })),
  };
}

/**
 * Accept the category and trade from the URL only if they exist, and drop a
 * trade that doesn't belong to the chosen category. Unknown values are
 * ignored rather than shown as an empty result.
 */
export function resolveTradeFilters(f: DirectoryFilters, catalog: TradeCatalog): DirectoryFilters {
  const category = catalog.categories.find((c) => c.name === f.category);
  const pool = category ? category.trades : catalog.categories.flatMap((c) => c.trades);
  const trade = pool.some((t) => t.name === f.trade) ? f.trade : "";
  return { ...f, category: category ? category.name : "", trade };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
