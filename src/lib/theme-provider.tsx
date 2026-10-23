import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
  setTheme: () => {},
});

const THEME_STORAGE_KEY = "gstudy_theme";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  } catch {
    // fallback if localStorage is blocked
  }
  return "light";
}

export function applyThemeToDOM(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    applyThemeToDOM(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // ignore
    }

    // Persist in profile metadata if logged in (try/catch silent)
    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("profiles").update({ theme: nextTheme }).eq("id", user.id);
        }
      } catch {
        // Safe to ignore if column or network is not available
      }
    })();
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  useEffect(() => {
    // Sync with DOM attribute set by head inline script
    const currentAttr = document.documentElement.getAttribute("data-theme") as Theme | null;
    if (currentAttr && (currentAttr === "light" || currentAttr === "dark")) {
      setThemeState(currentAttr);
    } else {
      applyThemeToDOM(theme);
    }

    // Listen to system theme changes if not explicitly overridden by user
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (!saved) {
        setTheme(e.matches ? "dark" : "light");
      }
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
