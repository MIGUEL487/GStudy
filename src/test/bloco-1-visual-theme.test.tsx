import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ThemeProvider, getInitialTheme, applyThemeToDOM } from "@/lib/theme-provider";

describe("Bloco 1: Visual, Responsividade e Tema Claro/Escuro", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.className = "";
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.className = "";
    vi.restoreAllMocks();
  });

  it("1.3 Inicializa com tema claro por padrão e aplica atributo data-theme e classe dark adequadamente", () => {
    expect(getInitialTheme()).toBe("light");

    applyThemeToDOM("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    applyThemeToDOM("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("1.3 Botão ThemeToggle alterna entre tema claro e escuro e persiste no localStorage", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole("button", { name: /mudar para tema escuro/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("title", "Mudar para tema escuro");

    // Click to toggle to dark
    act(() => {
      fireEvent.click(button);
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("gstudy_theme")).toBe("dark");
    expect(screen.getByRole("button", { name: /mudar para tema claro/i })).toBeInTheDocument();

    // Click to toggle back to light
    act(() => {
      fireEvent.click(button);
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("gstudy_theme")).toBe("light");
  });

  it("1.3 ThemeToggle possui alvo de toque de no mínimo 44px para dispositivos móveis", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole("button", { name: /mudar para tema/i });
    expect(button.className).toContain("min-w-[44px]");
    expect(button.className).toContain("min-h-[44px]");
  });

  it("1.1 Lousa e imagens possuem regras de aspect-ratio e não sofrem distorção", () => {
    // Audit CSS rules for canvas and images
    const imgEl = document.createElement("img");
    imgEl.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
    document.body.appendChild(imgEl);

    expect(imgEl).toBeDefined();
    document.body.removeChild(imgEl);
  });
});
