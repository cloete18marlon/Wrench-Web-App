"use client";

import { useActionState } from "react";
import { applyAsPro, type ApplyState } from "./actions";

const initialState: ApplyState = {};

export function BecomeProForm({ trades }: { trades: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(applyAsPro, initialState);

  return (
    <form className="form" action={formAction}>
      <div className="field">
        <label htmlFor="companyName">Company name (optional)</label>
        <input id="companyName" name="companyName" type="text" />
      </div>

      <div className="field">
        <label htmlFor="bio">Bio</label>
        <textarea id="bio" name="bio" rows={3} placeholder="Tell customers about your work" />
      </div>

      <div className="field">
        <label htmlFor="hourlyRate">Hourly rate (ZAR, optional)</label>
        <input id="hourlyRate" name="hourlyRate" type="number" min={0} step="0.01" />
      </div>

      <div className="field">
        <label htmlFor="serviceRadiusKm">Service radius (km)</label>
        <input
          id="serviceRadiusKm"
          name="serviceRadiusKm"
          type="number"
          min={1}
          step="1"
          defaultValue={15}
        />
      </div>

      <div className="field">
        <label>Trades</label>
        <div className="checkbox-grid">
          {trades.map((trade) => (
            <label key={trade.id} className="checkbox-item">
              <input type="checkbox" name="trades" value={trade.id} />
              {trade.name}
            </label>
          ))}
        </div>
      </div>

      {state.error && <p className="error-text">{state.error}</p>}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
