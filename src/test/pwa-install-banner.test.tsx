import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaInstallBanner } from "@/components/pwa-install-banner";

function offer(outcome: "accepted" | "dismissed" = "accepted") {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome, platform: "web" }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return { event, prompt };
}

describe("PwaInstallBanner", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "standalone", { configurable: true, value: undefined });
  });

  it("começa oculto e só aparece após o evento de instalação", () => {
    const { container } = render(<PwaInstallBanner />);
    expect(container.querySelector("aside")).toHaveAttribute("hidden");
    expect(screen.queryByRole("button", { name: "Instalar GStudy" })).not.toBeInTheDocument();
    const { event } = offer();
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole("button", { name: "Instalar GStudy" })).toBeVisible();
  });

  it("dispara o prompt nativo uma vez e esconde o banner ao aceitar", async () => {
    render(<PwaInstallBanner />);
    const { prompt } = offer();
    const button = screen.getByRole("button", { name: "Instalar GStudy" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() => expect(button).not.toBeVisible());
    offer();
    expect(button).not.toBeVisible();
  });

  it("descarta o prompt consumido quando a instalação é recusada", async () => {
    render(<PwaInstallBanner />);
    const { prompt } = offer("dismissed");
    fireEvent.click(screen.getByRole("button", { name: "Instalar GStudy" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Instalar GStudy" })).toBeNull(),
    );
    expect(prompt).toHaveBeenCalledOnce();
    offer();
    expect(screen.getByRole("button", { name: "Instalar GStudy" })).toBeVisible();
  });

  it("dispensa a oferta por toda a sessão ao escolher Agora não", () => {
    const view = render(<PwaInstallBanner />);
    offer();
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    offer();
    expect(screen.queryByRole("button", { name: "Instalar GStudy" })).toBeNull();
    view.unmount();
    render(<PwaInstallBanner />);
    offer();
    expect(screen.queryByRole("button", { name: "Instalar GStudy" })).toBeNull();
  });

  it("nunca oferece instalação em standalone, mesmo recebendo o evento", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query.includes("display-mode"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    render(<PwaInstallBanner />);
    const { prompt } = offer();
    expect(screen.queryByRole("button", { name: "Instalar GStudy" })).toBeNull();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("também detecta o modo standalone do iOS", () => {
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    render(<PwaInstallBanner />);
    offer();
    expect(screen.queryByRole("button", { name: "Instalar GStudy" })).toBeNull();
  });

  it("oculta imediatamente ao receber appinstalled", () => {
    render(<PwaInstallBanner />);
    offer();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    offer();
    expect(screen.queryByRole("button", { name: "Instalar GStudy" })).toBeNull();
  });

  it("trata falhas do prompt sem deixar uma oferta inutilizável", async () => {
    render(<PwaInstallBanner />);
    const { prompt } = offer();
    prompt.mockRejectedValue(new Error("Falha no navegador"));
    fireEvent.click(screen.getByRole("button", { name: "Instalar GStudy" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Não foi possível iniciar");
    expect(screen.queryByRole("button", { name: "Instalar GStudy" })).toBeNull();
  });
});
