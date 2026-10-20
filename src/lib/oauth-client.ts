import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { rememberNotion } from "./notion.functions";

const intentKey = "gstudy.oauth.intent";
type Intent = { provider: "google" | "notion"; userId?: string };
const pending = new Map<string, Promise<void>>();
export function oauthError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Não foi possível entrar. Tente novamente.";
  if (/provider.*not enabled|unsupported provider/i.test(message))
    return "Este login ainda não está ativado no Supabase. Confira Google ou Notion em Sign In / Providers.";
  if (/manual.*link|linking.*disabled/i.test(message))
    return "Ative o vínculo manual de identidades no Supabase para conectar o Notion à sua conta atual.";
  if (/identity.*already|already.*linked/i.test(message))
    return "Esta conta Notion já está vinculada. Entre com essa conta ou reconecte a identidade Notion já vinculada ao seu perfil.";
  if (/Failed to fetch|NetworkError/i.test(message))
    return "Não foi possível conectar. Confira sua conexão e tente novamente.";
  return message;
}
function readIntent(): Intent | null {
  try {
    return JSON.parse(sessionStorage.getItem(intentKey) || "null");
  } catch {
    return null;
  }
}
export async function startOAuth(provider: "google" | "notion", linkToUser?: string) {
  sessionStorage.setItem(
    intentKey,
    JSON.stringify({ provider, ...(linkToUser ? { userId: linkToUser } : {}) }),
  );
  const redirectTo = new URL(
    provider === "notion" ? "/configuracoes?notion=connected" : "/",
    window.location.origin,
  ).href;
  try {
    const result = linkToUser
      ? await supabase.auth.linkIdentity({ provider, options: { redirectTo } })
      : await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
          },
        });
    if (result.error) throw result.error;
  } catch (error) {
    sessionStorage.removeItem(intentKey);
    throw error;
  }
}
export async function connectNotion(userId: string, alreadyLinked: boolean) {
  if (!alreadyLinked) return startOAuth("notion", userId);
  // Reauthorizing an existing identity must keep the same GStudy user.
  sessionStorage.setItem(intentKey, JSON.stringify({ provider: "notion", userId }));
  const result = await supabase.auth.signInWithOAuth({
    provider: "notion",
    options: {
      redirectTo: new URL("/configuracoes?notion=connected", window.location.origin).href,
    },
  });
  if (result.error) {
    sessionStorage.removeItem(intentKey);
    throw result.error;
  }
}
export function captureNotionSession(session: Session): Promise<void> | null {
  const intent = readIntent();
  if (intent?.provider === "google") {
    sessionStorage.removeItem(intentKey);
    return null;
  }
  if (
    !session.provider_token ||
    (intent?.provider !== "notion" && session.user.app_metadata["provider"] !== "notion")
  )
    return null;
  if (intent?.userId && intent.userId !== session.user.id) {
    sessionStorage.removeItem(intentKey);
    return Promise.reject(
      new Error(
        "Você entrou em outra conta do GStudy. Volte à conta anterior e conecte a identidade Notion correspondente; nenhum material foi importado.",
      ),
    );
  }
  const key = session.user.id + ":" + session.provider_token;
  const existing = pending.get(key);
  if (existing) return existing;
  const promise = (async () => {
    await rememberNotion({
      data: {
        userId: session.user.id,
        token: session.provider_token!,
        ...(session.provider_refresh_token ? { refreshToken: session.provider_refresh_token } : {}),
      },
    });
    sessionStorage.removeItem(intentKey);
    // Remove the provider credential from the browser session after secure storage.
    const fresh = await supabase.auth.getSession();
    if (
      fresh.data.session?.user.id === session.user.id &&
      fresh.data.session.provider_token === session.provider_token
    ) {
      await supabase.auth.setSession({
        access_token: fresh.data.session.access_token,
        refresh_token: fresh.data.session.refresh_token,
      });
    }
    window.dispatchEvent(new Event("gstudy-notion-changed"));
  })();
  pending.set(key, promise);
  void promise.finally(() => pending.delete(key)).catch(() => {});
  return promise;
}
