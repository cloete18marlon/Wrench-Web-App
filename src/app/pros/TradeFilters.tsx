"use client";

import { useState } from "react";
import type { TradeCategory } from "@/lib/pros";

/**
 * Category and Trade dropdowns. Picking a category narrows the Trade list to
 * that category; with "All categories" the trades are grouped under category
 * headings. Both submit with the rest of the search form as ?category= and
 * ?trade=, and the server re-checks them (resolveTradeFilters), so nothing
 * here is trusted.
 */
export function TradeFilters({
  categories,
  category: initialCategory,
  trade: initialTrade,
}: {
  categories: TradeCategory[];
  category: string;
  trade: string;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [trade, setTrade] = useState(initialTrade);

  const selected = categories.find((c) => c.name === category);

  function changeCategory(next: string) {
    setCategory(next);
    // Keep the chosen trade only if it belongs to the new category.
    const inNext = categories.find((c) => c.name === next)?.trades.some((t) => t.name === trade);
    if (next && !inNext) setTrade("");
  }

  return (
    <div className="trade-filters">
      <div className="field dark">
        <label htmlFor="category">Category</label>
        <select id="category" name="category" value={category} onChange={(e) => changeCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field dark">
        <label htmlFor="trade">Trade</label>
        <select id="trade" name="trade" value={trade} onChange={(e) => setTrade(e.target.value)}>
          <option value="">All trades</option>
          {selected
            ? selected.trades.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))
            : categories.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {c.trades.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
        </select>
      </div>
    </div>
  );
}
