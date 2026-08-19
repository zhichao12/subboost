"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "@subboost/ui/components/ui/icon-button";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "subboost-theme";

function resolveTheme(): Theme {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f8fafc" : "#0a0a0a");
}

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>("dark");

  React.useEffect(() => {
    const current = resolveTheme();
    applyTheme(current);
    setTheme(current);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
    setTheme(next);
  };

  const isDark = theme === "dark";
  return (
    <IconButton
      label={isDark ? "切换到明亮模式" : "切换到黑暗模式"}
      variant="ghost"
      className="rounded-lg p-2 transition-colors hover:bg-white/5"
      onClick={toggleTheme}
    >
      {isDark ? <Sun className="h-5 w-5 text-white/70" /> : <Moon className="h-5 w-5 text-white/70" />}
    </IconButton>
  );
}
