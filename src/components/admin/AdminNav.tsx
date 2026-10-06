"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ActivePill from "@/components/ui/ActivePill";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/slots", label: "Slots" },
  { href: "/admin/shop", label: "Shop & Orders" },
  { href: "/admin/missions", label: "Quests" },
  { href: "/admin/verifications", label: "Verifications" },
  { href: "/admin/redemptions", label: "Redemptions" },
  { href: "/admin/rewards", label: "Rewards" },
  { href: "/admin/patrons", label: "Patrons" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/support", label: "Support" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b bg-card/85 px-4 backdrop-blur" aria-label="Admin sections">
      {TABS.map((tab) => {
        const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`relative whitespace-nowrap px-3 py-3 text-sm transition-colors ${
              active ? "font-medium text-emerald-400" : "text-ink-2 hover:text-ink"
            }`}
          >
            {active && <ActivePill id="admin-tab" className="inset-x-1 bottom-0 h-0.5 rounded-full bg-emerald-400" />}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
