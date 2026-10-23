import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      onClick={toggleTheme}
      className={`min-w-[44px] min-h-[44px] rounded-md transition-colors hover:bg-secondary/60 text-foreground ${className}`}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      title={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
    >
      {isDark ? (
        <Sun className="h-5 w-5 text-accent transition-transform duration-200" strokeWidth={1.75} />
      ) : (
        <Moon
          className="h-5 w-5 text-muted-foreground hover:text-foreground transition-transform duration-200"
          strokeWidth={1.75}
        />
      )}
      <span className="sr-only">{isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}</span>
    </Button>
  );
}
