"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  key: string;
  label: string;
  href: string;
  match: (path: string) => boolean;
  icon: React.ReactNode;
};

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none"
       stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const HOME = "M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20";
const SEARCH = "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15ZM21 21l-5.2-5.2";
const CHAT = "M4 5.5h16v10.5H9l-5 4v-4.5z";
const PERSON = "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5";

// Auth screens get the whole viewport; the tab bar would only compete with
// the one thing the person came to do.
const HIDDEN_ON = ["/login", "/signup", "/auth"];

export function BottomNav({ signedIn }: { signedIn: boolean }) {
  const path = usePathname() ?? "/";
  if (HIDDEN_ON.some((p) => path === p || path.startsWith(p + "/"))) return null;

  const tabs: Tab[] = [
    { key: "home", label: "Home", href: "/", match: (p) => p === "/", icon: <Icon d={HOME} /> },
    { key: "search", label: "Search", href: "/pros", match: (p) => p.startsWith("/pros"), icon: <Icon d={SEARCH} /> },
    { key: "chat", label: "Chat", href: "/messages", match: (p) => p.startsWith("/messages"), icon: <Icon d={CHAT} /> },
    signedIn
      ? {
          key: "profile",
          label: "Profile",
          href: "/dashboard",
          // Jobs, banking and admin all hang off the profile, so the tab stays lit there.
          match: (p) => ["/dashboard", "/jobs", "/admin"].some((x) => p === x || p.startsWith(x + "/")),
          icon: <Icon d={PERSON} />,
        }
      : { key: "profile", label: "Log in", href: "/login", match: () => false, icon: <Icon d={PERSON} /> },
  ];

  return (
    <nav className="tab-bar" aria-label="Main">
      {tabs.map((t) => {
        const active = t.match(path);
        return (
          <Link key={t.key} href={t.href} className={`tab${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}>
            {t.icon}
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
