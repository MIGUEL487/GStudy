import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AccountDatabase } from "@/integrations/supabase/account-types";
import { loadData, storageKey } from "@/lib/study-model";
import type { Json } from "@/integrations/supabase/types";
import {
  canonical,
  fingerprint,
  localChangeEvent,
  localDocumentKey,
  mergeAccountDocuments,
  namespaces,
  parseAccountDocument,
  type Document,
  type Fingerprint,
  type Namespace,
} from "@/lib/account-sync-model";

function safeAnySignal(signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const active = signals.filter(Boolean) as AbortSignal[];
  if (!active.length) return undefined;
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
    return AbortSignal.any(active);
  }
  const controller = new AbortController();
  for (const s of active) {
    if (s.aborted) {
      controller.abort(s.reason);
      return controller.signal;
    }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

type Status = "loading" | "syncing" | "synced" | "offline" | "setup" | "error";
type SyncValue = { status: Status; message: string; retry: () => void };
const Context = createContext<SyncValue>({
  status: "offline",
  message: "Dados salvos neste aparelho.",
  retry: () => {},
});
const baselineEntry = z.object({
  revision: z.number().int().nonnegative(),
  nodes: z.record(z.string(), z.string()),
});
const baselineSchema = z
  .object({
    workspace: baselineEntry,
    learning: baselineEntry,
    recall: baselineEntry,
    attempts: baselineEntry,
    socrates: baselineEntry,
    quizzes: baselineEntry,
  })
  .partial();
type Baselines = Partial<Record<Namespace, { revision: number; nodes: Fingerprint } | undefined>>;
const responseSchema = z.object({
  applied: z.boolean(),
  revision: z.number().int().nonnegative(),
  document: z.unknown(),
});
export function AccountSyncProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Conectando seus estudos à conta…");
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    const db = supabase as unknown as SupabaseClient<AccountDatabase>;
    const cancellation = new AbortController();
    let alive = true,
      busy = false,
      pending = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const key = `gstudy.sync.baseline.v1:${userId}`;
    let baselines: Baselines = {};
    try {
      const raw = localStorage.getItem(key);
      if (raw) baselines = baselineSchema.parse(JSON.parse(raw));
    } catch {
      /* Missing baseline is imported conservatively; original data stays intact. */
    }
    const show = (state: Status, text: string) => {
      if (alive) {
        setStatus(state);
        setMessage(text);
      }
    };
    const read = (ns: Namespace) => {
      const raw = localStorage.getItem(localDocumentKey(userId, ns));
      return raw ? parseAccountDocument(ns, JSON.parse(raw)) : undefined;
    };
    const apply = (ns: Namespace, document: Document) => {
      const current = read(ns);
      if (current && canonical(current) === canonical(document)) return;
      const localKey = localDocumentKey(userId, ns),
        value = JSON.stringify(document);
      localStorage.setItem(localKey, value);
      window.dispatchEvent(new StorageEvent("storage", { key: localKey, newValue: value }));
    };
    const sync = async () => {
      if (!alive) return;
      if (busy) {
        pending = true;
        return;
      }
      busy = true;
      pending = false;
      try {
        show("syncing", "Sincronizando com sua conta…");
        // Import pre-account browser data before a cloud document can occupy its key.
        const workspaceKey = localDocumentKey(userId, "workspace");
        const legacyOwner = localStorage.getItem(`${storageKey}.legacy-owner`);
        if (
          !localStorage.getItem(workspaceKey) &&
          (!legacyOwner || legacyOwner === userId) &&
          (localStorage.getItem(storageKey) || localStorage.getItem("materias"))
        ) {
          const legacy = parseAccountDocument("workspace", loadData(localStorage));
          localStorage.setItem(workspaceKey, JSON.stringify(legacy));
          localStorage.setItem(`${storageKey}.legacy-owner`, userId);
        }
        const { data: rows, error } = await db
          .from("account_documents")
          .select("namespace,revision,document")
          .abortSignal(safeAnySignal([cancellation.signal, AbortSignal.timeout(10000)]));
        if (error) throw error;
        if (!alive) return;
        let socratesSetup = false;
        let quizzesSetup = false;
        for (const ns of namespaces) {
          if (!alive) return;
          let local = read(ns);
          const row = rows?.find((r) => r.namespace === ns);
          let remote = row ? parseAccountDocument(ns, row.document) : undefined;
          let revision = row?.revision ?? 0;
          if (!local && !remote) continue;
          const base = baselines[ns]?.nodes;
          if (!local && remote) {
            apply(ns, remote);
            baselines[ns] = { revision, nodes: fingerprint(remote) };
            continue;
          }
          let proposal = remote
            ? mergeAccountDocuments(ns, base, local!, remote)
            : { document: local!, copies: 0 };
          let acknowledged = remote;
          for (
            let attempt = 0;
            attempt < 4 && (!remote || canonical(proposal.document) !== canonical(remote));
            attempt++
          ) {
            const { data, error: writeError } = await db
              .rpc("sync_account_document", {
                p_namespace: ns,
                p_revision: revision,
                p_document: proposal.document as Json,
              })
              .abortSignal(safeAnySignal([cancellation.signal, AbortSignal.timeout(10000)]));
            if (writeError) {
              if (
                (ns === "socrates" || ns === "quizzes") &&
                ["PGRST202", "42P01", "23514", "22023"].includes(writeError.code)
              ) {
                if (ns === "socrates") socratesSetup = true;
                else quizzesSetup = true;
                break;
              }
              throw writeError;
            }
            if (!alive) return;
            const reply = responseSchema.parse(data);
            revision = reply.revision;
            acknowledged = reply.document ? parseAccountDocument(ns, reply.document) : undefined;
            if (reply.applied) {
              if (proposal.copies)
                toast.info(
                  ns === "quizzes"
                    ? "Respostas simultâneas do quiz foram preservadas no histórico."
                    : "Edições simultâneas de um caderno foram preservadas em cópias.",
                );
              break;
            }
            remote = acknowledged;
            local = read(ns);
            proposal = remote
              ? mergeAccountDocuments(ns, base, local!, remote)
              : { document: local!, copies: 0 };
            if (attempt === 3)
              throw new Error("Há alterações em outro aparelho. Tentaremos sincronizar novamente.");
          }
          if (
            !acknowledged ||
            (ns === "socrates" && socratesSetup) ||
            (ns === "quizzes" && quizzesSetup)
          )
            continue;
          const newest = read(ns);
          const effective =
            newest && canonical(newest) !== canonical(local)
              ? mergeAccountDocuments(
                  ns,
                  local ? fingerprint(local) : undefined,
                  newest,
                  acknowledged,
                ).document
              : acknowledged;
          apply(ns, effective);
          baselines[ns] = { revision, nodes: fingerprint(acknowledged) };
          if (canonical(effective) !== canonical(acknowledged)) pending = true;
        }
        localStorage.setItem(key, JSON.stringify(baselines));
        if (quizzesSetup)
          show(
            "setup",
            "Ative a migração 0018_quiz_sync.sql para sincronizar quizzes. As respostas continuam neste aparelho.",
          );
        else if (socratesSetup)
          show(
            "setup",
            "Ative a migração 0003_socrates.sql no Supabase para sincronizar Sócrates. Os demais estudos foram sincronizados.",
          );
        else show("synced", "Sua conta está sincronizada.");
      } catch (e) {
        const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
        if (["PGRST205", "PGRST202", "42P01", "42883"].includes(code))
          show(
            "setup",
            "Ative a migração 0002_account_sync_reviews.sql no Supabase. Os dados continuam neste aparelho.",
          );
        else if (
          !navigator.onLine ||
          e instanceof TypeError ||
          (e instanceof Error && /abort|timeout|fetch/i.test(e.message))
        )
          show(
            "offline",
            "Sem conexão com a conta. Seus dados continuam neste aparelho; vamos tentar novamente.",
          );
        else
          show(
            "error",
            "Não foi possível sincronizar agora. Seus dados locais foram preservados. Tente novamente.",
          );
      } finally {
        busy = false;
        if (alive) setReady(true);
        if (pending && alive) debounce = setTimeout(() => void sync(), 500);
      }
    };
    const schedule = () => {
      show("syncing", "Alterações salvas neste aparelho. Enviando à conta…");
      clearTimeout(debounce);
      debounce = setTimeout(() => void sync(), 700);
    };
    const focus = () => {
      if (!document.hidden) void sync();
    };
    retry.current = () => void sync();
    void sync();
    const interval = setInterval(() => {
      if (!document.hidden) void sync();
    }, 10000);
    window.addEventListener(localChangeEvent, schedule);
    window.addEventListener("online", focus);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      alive = false;
      cancellation.abort();
      clearInterval(interval);
      clearTimeout(debounce);
      window.removeEventListener(localChangeEvent, schedule);
      window.removeEventListener("online", focus);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [userId]);
  return (
    <Context.Provider value={{ status, message, retry: () => retry.current() }}>
      {ready ? (
        children
      ) : (
        <div className="account-connecting" role="status">
          <Cloud size={30} />
          <p>Sincronizando sua conta…</p>
        </div>
      )}
    </Context.Provider>
  );
}
export function useAccountSync() {
  return useContext(Context);
}
export function SyncStatus() {
  const sync = useAccountSync();
  return (
    <button
      type="button"
      className={`account-sync-status is-${sync.status}`}
      title={sync.message}
      aria-label={sync.message}
      onClick={sync.retry}
    >
      {sync.status === "offline" || sync.status === "error" || sync.status === "setup" ? (
        <CloudOff size={15} />
      ) : sync.status === "syncing" ? (
        <RefreshCw size={15} className="sync-spin" />
      ) : (
        <Cloud size={15} />
      )}
      <span>
        {sync.status === "synced"
          ? "Sincronizado"
          : sync.status === "syncing"
            ? "Sincronizando…"
            : "Ver sincronização"}
      </span>
    </button>
  );
}
