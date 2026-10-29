import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PwaInstallButton } from "@/components/pwa-install-button";

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: mocks }));

describe("PwaInstallButton", () => {
  beforeEach(() => {
    mocks.info.mockReset();
    mocks.success.mockReset();
  });

  it("usa o prompt nativo de instalação quando ele está disponível", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt") as Event & {
      prompt: typeof prompt;
      userChoice: Promise<{ outcome: "accepted"; platform: string }>;
    };
    event.prompt = prompt;
    event.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });

    render(<PwaInstallButton />);
    window.dispatchEvent(event);
    fireEvent.click(await screen.findByRole("button", { name: "Instalar GStudy" }));

    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Instalar GStudy" })).not.toBeInTheDocument(),
    );
  });

  it("explica como instalar quando o navegador não fornece um prompt", () => {
    render(<PwaInstallButton />);
    fireEvent.click(screen.getByRole("button", { name: "Instalar GStudy" }));
    expect(mocks.info).toHaveBeenCalledOnce();
  });
});
