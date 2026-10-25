import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

type ThemeTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => {
    ready: Promise<void>;
    finished: Promise<void>;
    skipTransition: () => void;
  };
};

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
  // Match SSR on the first React render; the head script already painted the palette.
  const [theme, setThemeState] = useState<Theme>("light");
  const transitionRunning = useRef(false);

  const commitTheme = useCallback((nextTheme: Theme) => {
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
          const { error } = await supabase
            .from("profiles")
            .update({ theme: nextTheme })
            .eq("id", user.id);
          if (error)
            toast.error("Tema salvo neste navegador. Não foi possível sincronizar com seu perfil.");
        }
      } catch {
        // A palette preference must remain usable without a configured backend.
      }
    })();
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => commitTheme(nextTheme), [commitTheme]);

  const toggleTheme = useCallback(() => {
    if (transitionRunning.current) return;
    const nextTheme = theme === "light" ? "dark" : "light";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const viewDocument = document as ThemeTransitionDocument;
    if (reduced || !viewDocument.startViewTransition) {
      commitTheme(nextTheme);
      return;
    }

    transitionRunning.current = true;
    document.documentElement.classList.add("theme-view-transition");
    const transition = viewDocument.startViewTransition(() => commitTheme(nextTheme));
    void transition.finished.finally(() => {
      transitionRunning.current = false;
      document.documentElement.classList.remove("theme-view-transition");
    });
    void transition.ready
      .then(() => {
        const radius = Math.hypot(window.innerWidth, window.innerHeight);
        document.documentElement.animate(
          {
            clipPath: ["circle(0px at 0% 100%)", `circle(${radius}px at 0% 100%)`],
          },
          {
            duration: 720,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {
        // The theme was already committed; unsupported animation details need no retry.
      });
  }, [theme, commitTheme]);

  useEffect(() => {
    // Sync with DOM attribute set by head inline script
    const currentAttr = document.documentElement.getAttribute("data-theme") as Theme | null;
    if (currentAttr && (currentAttr === "light" || currentAttr === "dark")) {
      setThemeState(currentAttr);
    } else {
      const initial = getInitialTheme();
      setThemeState(initial);
      applyThemeToDOM(initial);
    }

    // Listen to system theme changes if not explicitly overridden by user
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(THEME_STORAGE_KEY)) return;
      } catch {
        /* System preferences work even with storage blocked. */
      }
      const next = e.matches ? "dark" : "light";
      setThemeState(next);
      applyThemeToDOM(next);
    };
    const storage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next = getInitialTheme();
      setThemeState(next);
      applyThemeToDOM(next);
    };
    media.addEventListener("change", handler);
    window.addEventListener("storage", storage);
    return () => {
      media.removeEventListener("change", handler);
      window.removeEventListener("storage", storage);
    };
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
