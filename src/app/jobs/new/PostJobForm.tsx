"use client";

import { useActionState } from "react";
import { postJob, type PostJobState } from "./actions";

const initialState: PostJobState = {};

export function PostJobForm({ trades }: { trades: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(postJob, initialState);

  return (
    <form className="form" action={formAction}>
      <div className="field">
        <label htmlFor="tradeId">Trade</label>
        <select id="tradeId" name="tradeId" required defaultValue="">
          <option value="" disabled>
            Select a trade
          </option>
          {trades.map((trade) => (
            <option key={trade.id} value={trade.id}>
              {trade.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" type="text" placeholder="e.g. Repaint garage door" required />
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" rows={4} placeholder="What needs doing?" />
      </div>

      <div className="field">
        <label htmlFor="budgetMin">Budget range (ZAR, optional)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input id="budgetMin" name="budgetMin" type="number" min={0} placeholder="Min" />
          <input name="budgetMax" type="number" min={0} placeholder="Max" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="preferredDate">Preferred date (optional)</label>
        <input id="preferredDate" name="preferredDate" type="date" />
      </div>

      {state.error && <p className="error-text">{state.error}</p>}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Posting…" : "Post job"}
      </button>
    </form>
  );
}
