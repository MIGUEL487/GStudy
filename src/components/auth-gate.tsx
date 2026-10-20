import type React from "react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { captureNotionSession, oauthError, startOAuth } from "@/lib/oauth-client";
import { Button } from "@/components/ui/button";
import { logo, studyImage } from "@/lib/images";

type AuthValue = { user: User; signOut: () => Promise<void> };
const ag = globalThis as { __gstudyAuthContext?: React.Context<AuthValue | null> };
const AuthContext = (ag.__gstudyAuthContext ??= createContext<AuthValue | null>(null));
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthGate missing");
  return context;
};

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [providerSession, setProviderSession] = useState<Session | null>(null);
  const currentUser = useRef<string | undefined>(undefined);
  useEffect(() => {
    let active = true,
      revision = 0;
    let unsubscribe = () => {};
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    sessionStorage.removeItem("gstudy-password-recovery");
    if (hash.has("error") || url.searchParams.has("error")) {
      setError(
        "A entrada foi cancelada ou não foi autorizada. Tente novamente com Google ou Notion.",
      );
      sessionStorage.removeItem("gstudy.oauth.intent");
    }
    try {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        if (event !== "INITIAL_SESSION") revision++;
        setUser(session?.user ?? null);
        if (session?.provider_token) setProviderSession(session);
        if (currentUser.current !== session?.user.id) {
          currentUser.current = session?.user.id;
          void router.invalidate();
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
      const startRevision = revision;
      void supabase.auth
        .getUser()
        .then(({ data, error: failure }) => {
          if (!active) return;
          if (startRevision === revision) setUser(data.user ?? null);
          if (failure && failure.name !== "AuthSessionMissingError") setError(oauthError(failure));
        })
        .catch((e) => {
          if (active) setError(oauthError(e));
        })
        .finally(() => {
          if (active) setChecking(false);
        });
    } catch (e) {
      setError(oauthError(e));
      setChecking(false);
    }
    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);
  useEffect(() => {
    if (!providerSession || providerSession.user.id !== user?.id) return;
    let active = true;
    // This effect runs outside the Supabase auth callback's lock.
    const saved = captureNotionSession(providerSession);
    if (saved)
      void saved.catch((e) => {
        if (active) toast.error(oauthError(e));
      });
    return () => {
      active = false;
    };
  }, [providerSession, user?.id]);
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      setUser(null);
      setProviderSession(null);
      await router.navigate({ to: "/", replace: true });
      toast.success("Você saiu da conta. Até logo!");
    } catch (e) {
      toast.error(oauthError(e));
    }
  };
  if (checking)
    return (
      <div className="auth-loading">
        <img src={logo.url} alt="" />
        GStudy
      </div>
    );
  if (!user) return <LoginScreen initialError={error} />;
  return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;
}

function LoginScreen({ initialError }: { initialError: string }) {
  const [busy, setBusy] = useState<"google" | "notion" | null>(null);
  const [error, setError] = useState(initialError);
  const enter = async (provider: "google" | "notion") => {
    if (busy) return;
    setBusy(provider);
    setError("");
    try {
      await startOAuth(provider);
    } catch (e) {
      setError(oauthError(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="login-screen">
      <div className="login-panel page-enter">
        <div className="brand login-brand">
          <img src={logo.url} alt="" />
          GStudy
        </div>
        <h1>Bem-vindo(a) de volta!</h1>
        <p className="page-subtitle">Seu ritmo. Sua jornada. Entre para continuar estudando.</p>
        <Button
          variant="outline"
          className="w-full"
          disabled={!!busy}
          onClick={() => void enter("google")}
        >
          <GoogleMark />
          {busy === "google" ? "Conectando…" : "Continuar com o Google"}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          disabled={!!busy}
          onClick={() => void enter("notion")}
        >
          <NotionMark />
          {busy === "notion" ? "Conectando…" : "Continuar com o Notion"}
        </Button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="page-subtitle text-xs">
          Ao conectar o Notion, você escolhe quais páginas de estudo quer compartilhar com o GStudy.
        </p>
      </div>
      <div className="login-art">
        <img src={studyImage.url} alt="Mesa de estudos iluminada pelo sol" />
      </div>
    </div>
  );
}

export function NotionMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M7 17V7l10 10V7M5.5 7h3M15.5 7h3M5.5 17h3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
