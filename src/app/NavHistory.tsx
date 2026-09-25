"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Remembers the in-app pages visited in this tab, so the back button can
 * tell "there is a Wrenchy page behind me" from "I arrived from a link".
 * Stored per tab in sessionStorage; nothing leaves the browser.
 */
const KEY = "wrenchy:trail";
const MAX = 50;

function readTrail(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeTrail(trail: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-MAX)));
  } catch {
    // Private mode or storage full: the back button falls back to parent pages.
  }
}

export function NavHistory() {
  const path = usePathname();
  useEffect(() => {
    if (!path) return;
    const trail = readTrail();
    if (trail[trail.length - 1] === path) return; // refresh
    if (trail[trail.length - 2] === path) trail.pop(); // went back
    else trail.push(path);
    writeTrail(trail);
  }, [path]);
  return null;
}

/** The page one level up: /jobs/123 -> /jobs, /dashboard/banking -> /dashboard. */
export function parentOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return "/" + parts.slice(0, -1).join("/");
}

export function BackButton({
  fallback,
  tone = "light",
  label = "Go back",
}: {
  fallback?: string;
  tone?: "light" | "dark";
  label?: string;
}) {
  const router = useRouter();
  const path = usePathname() ?? "/";

  function goBack() {
    const trail = readTrail();
    if (trail.length > 1) router.back();
    else router.push(fallback ?? parentOf(path));
  }

  return (
    <button type="button" onClick={goBack} className={`round-btn ${tone === "light" ? "light" : ""}`} aria-label={label}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor"
           strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}
