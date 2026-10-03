"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b bg-white px-4" aria-label="Admin sections">
      {TABS.map((tab) => {
        const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${
              active ? "border-green-600 font-medium text-green-700" : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
