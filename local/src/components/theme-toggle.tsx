"use client";

import * as React from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@subboost/ui/components/ui/dropdown-menu";
import { IconButton } from "@subboost/ui/components/ui/icon-button";

type Theme = "light" | "dark";
type ThemePreference = Theme | "system";

const THEME_STORAGE_KEY = "subboost-theme";

function getThemePreference(): ThemePreference {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

function resolveTheme(preference: ThemePreference): Theme {
  if (preference === "light" || preference === "dark") return preference;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(preference: ThemePreference) {
  const theme = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.dataset.themePreference = preference;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f8fafc" : "#0a0a0a");
  return theme;
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "明亮模式" },
  { value: "dark", label: "黑暗模式" },
];

export function ThemeToggle() {
  const [preference, setPreference] = React.useState<ThemePreference>("system");
  const [theme, setTheme] = React.useState<Theme>("dark");

  React.useEffect(() => {
    const currentPreference = getThemePreference();
    setPreference(currentPreference);
    setTheme(applyTheme(currentPreference));

    if (currentPreference !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const syncSystemTheme = () => setTheme(applyTheme("system"));
    mediaQuery.addEventListener("change", syncSystemTheme);
    return () => mediaQuery.removeEventListener("change", syncSystemTheme);
  }, []);

  const selectTheme = (value: string) => {
    const nextPreference = value as ThemePreference;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    setPreference(nextPreference);
    setTheme(applyTheme(nextPreference));
  };

  const icon = preference === "system" ? <Laptop className="h-5 w-5" /> : theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />;
  const currentLabel = THEME_OPTIONS.find((option) => option.value === preference)?.label ?? "跟随系统";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          label={`界面主题：${currentLabel}`}
          variant="ghost"
          className="subboost-theme-trigger rounded-lg p-2 transition-colors hover:bg-white/5"
        >
          {icon}
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="subboost-theme-menu w-36">
        <DropdownMenuLabel className="subboost-theme-menu-label">界面主题</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={preference} onValueChange={selectTheme}>
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="subboost-theme-menu-item">
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
