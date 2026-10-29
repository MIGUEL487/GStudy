import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });

    const ready = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const complete = () => {
      setInstalled(true);
      setInstallPrompt(null);
      toast.success("GStudy instalado neste aparelho.");
    };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", complete);
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!installPrompt) {
      const appleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);
      toast.info(
        appleMobile
          ? "No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início."
          : "Abra o menu do navegador e escolha Instalar GStudy ou Adicionar à tela inicial.",
      );
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setInstalled(true);
  };

  return (
    <button
      type="button"
      className="pwa-install-button"
      onClick={() => void install()}
      aria-label="Instalar GStudy"
      title="Instalar GStudy neste aparelho"
    >
      <Download size={17} />
      <span className="pwa-install-label">Instalar</span>
    </button>
  );
}
