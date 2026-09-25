// Wrenchy's cut of each job. Flat for now — revisit if it ever needs to vary
// by trade, tier, or promotion.
export const COMMISSION_RATE = 0.1;

export function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function splitCommission(total: number): { commission: number; payout: number } {
  const commission = round2(total * COMMISSION_RATE);
  return { commission, payout: round2(total - commission) };
}

/** "R2,400" or "R2,400.50" - the format the prototype uses. */
export function formatRand(amount: number): string {
  const whole = Math.abs(amount % 1) < 0.005;
  return (
    (amount < 0 ? "-R" : "R") +
    Math.abs(amount).toLocaleString("en-US", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}
