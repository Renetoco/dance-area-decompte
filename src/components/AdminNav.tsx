"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminNav({ role }: { role: "ADMIN" | "COMPTABILITE" | "DIRECTION" }) {
  const pathname = usePathname();
  const links = [{ href: "/admin", label: "Vue d'ensemble", icon: "▤" }];
  if (role === "ADMIN") {
    links.push({ href: "/admin/administration", label: "Administration", icon: "⚙" });
  }

  return (
    <nav>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : ""}>
          <span className="ico" aria-hidden="true">
            {l.icon}
          </span>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
