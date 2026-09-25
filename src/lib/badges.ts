/**
 * What each verification_tier claims, in the words customers see.
 *
 * These labels are representations customers rely on when they let someone
 * into their home (roadmap section 5.4). Each one must describe the check
 * that has ACTUALLY been run for that tier - not the check we plan to run.
 *
 * Today tier 1 is granted by an admin clicking "Approve" in /admin. No ID
 * check exists yet, so tier 1 must not say "ID verified". Change the wording
 * here only when the check behind it is live.
 */
export type Badge = { label: string; description: string };

export const TIER_BADGE: Record<number, Badge | null> = {
  0: null, // Never shown publicly - tier 0 profiles are not visible to guests.
  1: { label: "Approved", description: "Reviewed and approved by the Wrenchy team." },
  2: { label: "Background checked", description: "Criminal record check completed." },
  3: { label: "Trade certified", description: "Trade-body registration confirmed." },
};

/** The "verified pros only" filter means background checked or better. */
export const VERIFIED_MIN_TIER = 2;

export function tierLabel(tier: number | null | undefined): string {
  if (!tier) return "Not approved yet";
  return TIER_BADGE[tier]?.label ?? "Not approved yet";
}
