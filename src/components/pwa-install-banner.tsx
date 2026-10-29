import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

export function PwaInstallBanner({ suppressed = false }: { suppressed?: boolean }) {
  const { available, canPrompt, installing, error, install, dismiss } = usePwaInstall();
  const [showManualHelp, setShowManualHelp] = useState(false);

  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((cause: unknown) => {
        console.warn("Não foi possível preparar o modo offline do GStudy.", cause);
      });
  }, []);

  return (
    <>
      <aside
        className="pwa-install-banner"
        data-visible={available && !suppressed}
        hidden={!available || suppressed}
        aria-labelledby="pwa-install-title"
        aria-describedby="pwa-install-description"
      >
        <img src="/icons/gstudy-192.png" width={56} height={56} alt="" />
        <div className="pwa-install-copy">
          <span className="pwa-install-eyebrow">Seu espaço de estudo, sempre por perto</span>
          <h2 id="pwa-install-title">Leve o GStudy com você</h2>
          <p id="pwa-install-description">
            {showManualHelp
              ? "No Chrome, toque em ⋮ e escolha Instalar app ou Adicionar à tela inicial."
              : "Instale o app e abra seus estudos direto da tela inicial."}
          </p>
        </div>
        <div className="pwa-install-actions">
          <button
            type="button"
            className="pwa-install-primary"
            disabled={installing}
            onClick={() => {
              if (canPrompt) void install();
              else setShowManualHelp(true);
            }}
            aria-label="Instalar GStudy"
          >
            <Download size={16} aria-hidden="true" />
            {installing ? "Instalando…" : canPrompt ? "Instalar" : "Como instalar"}
          </button>
          <button type="button" disabled={installing} onClick={dismiss}>
            Agora não
          </button>
        </div>
      </aside>
      {error && (
        <p className="pwa-install-error" role="status">
          {error}
        </p>
      )}
    </>
  );
}
