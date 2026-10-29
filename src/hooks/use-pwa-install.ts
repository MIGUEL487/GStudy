import { useEffect, useRef, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const dismissalKey = "gstudy-install-dismissed";
const appDisplayModes =
  "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)";

export function isPwaStandalone() {
  return (
    window.matchMedia(appDisplayModes).matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function wasDismissed() {
  try {
    return sessionStorage.getItem(dismissalKey) === "1";
  } catch {
    return false;
  }
}

export function usePwaInstall() {
  const promptRef = useRef<InstallPromptEvent | null>(null);
  const blocked = useRef(false);
  const pending = useRef(false);
  const [available, setAvailable] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    blocked.current = wasDismissed();
    const hide = () => {
      promptRef.current = null;
      setAvailable(false);
    };
    const ready = (event: Event) => {
      event.preventDefault();
      if (blocked.current || pending.current || isPwaStandalone()) return;
      promptRef.current = event as InstallPromptEvent;
      setError("");
      setAvailable(true);
    };
    const complete = () => {
      blocked.current = true;
      hide();
    };
    const checkDisplayMode = () => {
      if (isPwaStandalone()) hide();
    };
    const displayMode = window.matchMedia(appDisplayModes);
    displayMode.addEventListener?.("change", checkDisplayMode);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", complete);
    window.addEventListener("pageshow", checkDisplayMode);
    return () => {
      promptRef.current = null;
      displayMode.removeEventListener?.("change", checkDisplayMode);
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", complete);
      window.removeEventListener("pageshow", checkDisplayMode);
    };
  }, []);

  const dismiss = () => {
    blocked.current = true;
    promptRef.current = null;
    setAvailable(false);
    try {
      sessionStorage.setItem(dismissalKey, "1");
    } catch {
      // The in-memory dismissal still works when storage is unavailable.
    }
  };

  const install = async () => {
    const event = promptRef.current;
    if (!event || pending.current || blocked.current || isPwaStandalone()) {
      setAvailable(false);
      return;
    }
    pending.current = true;
    promptRef.current = null; // A browser install event can only be used once.
    setInstalling(true);
    setError("");
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") blocked.current = true;
    } catch {
      setError("Não foi possível iniciar a instalação. Tente novamente pelo menu do navegador.");
    } finally {
      pending.current = false;
      setInstalling(false);
      setAvailable(false);
    }
  };

  return { available, installing, error, install, dismiss };
}
