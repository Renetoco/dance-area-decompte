"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") as Theme | null;
    setTheme(current ?? getSystemTheme());
  }, []);

  function toggle() {
    const next: Theme = (theme ?? getSystemTheme()) === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // stockage indisponible (mode privé, etc.) — le thème reste appliqué pour la session en cours
    }
  }

  const isDark = theme === "dark";

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label="Changer de thème">
      <span aria-hidden="true">{isDark ? "☀" : "☾"}</span>
      {isDark ? "Thème clair" : "Thème sombre"}
    </button>
  );
}
