import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  emptyRecallSession,
  readRecallSessions,
  recallSessionId,
  recallSessionSchema,
  recallStorageKey,
  type RecallSession,
  type RecallSessions,
} from "@/lib/recall-session";
import type { LearningSearch } from "@/lib/learning-model";
import { signalAccountChange } from "@/lib/account-sync-model";

type Update = (
  search: LearningSearch,
  fn: (session: RecallSession) => RecallSession,
  requirePersistence?: boolean,
) => boolean;
const Context = createContext<{
  data: RecallSessions;
  ready: boolean;
  error: string;
  update: Update;
} | null>(null);
export function RecallSessionProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [data, setData] = useState<RecallSessions>({ version: 1, sessions: {} });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const current = useRef(data);
  const readable = useRef(false);
  const key = recallStorageKey(userId);
  useEffect(() => {
    readable.current = false;
    current.current = { version: 1, sessions: {} };
    setData(current.current);
    setReady(false);
    setError("");
    try {
      const saved = readRecallSessions(localStorage.getItem(key));
      current.current = saved;
      setData(saved);
      readable.current = true;
    } catch {
      setError(
        "Não foi possível ler sua sessão do Active Recall. Os dados salvos foram preservados.",
      );
    } finally {
      setReady(true);
    }
    const sync = (event: StorageEvent) => {
      if (event.key !== key) return;
      try {
        const loaded = readRecallSessions(localStorage.getItem(key));
        for (const [id, session] of Object.entries(current.current.sessions)) {
          if (
            ["loading", "grading"].includes(session.phase) &&
            loaded.sessions[id]?.updatedAt === session.updatedAt
          )
            loaded.sessions[id] = session;
        }
        current.current = loaded;
        setData(loaded);
        readable.current = true;
      } catch {
        setError(
          "Não foi possível ler a sessão recebida da conta. O conteúdo aberto foi preservado.",
        );
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  const update = useCallback<Update>(
    (search, fn, requirePersistence = false) => {
      if (!readable.current) return false;
      const id = recallSessionId(search);
      let next: RecallSessions;
      try {
        const session = recallSessionSchema.parse({
          ...fn(current.current.sessions[id] ?? emptyRecallSession),
          search,
          updatedAt: Date.now(),
        });
        next = { version: 1, sessions: { ...current.current.sessions, [id]: session } };
      } catch {
        setError(
          "Não foi possível atualizar a sessão do Active Recall. Seu conteúdo foi preservado.",
        );
        return false;
      }
      let saved = true;
      try {
        localStorage.setItem(key, JSON.stringify(next));
        setError("");
      } catch {
        saved = false;
        setError(
          "Não foi possível salvar a sessão neste navegador. O conteúdo continua aberto, mas pode ser perdido ao recarregar. Libere espaço e tente salvar novamente.",
        );
      }
      if (saved || !requirePersistence) {
        current.current = next;
        setData(next);
      }
      if (saved) signalAccountChange();
      return saved;
    },
    [key],
  );
  return <Context.Provider value={{ data, ready, error, update }}>{children}</Context.Provider>;
}
export function useRecallSessions() {
  const value = useContext(Context);
  if (!value) throw new Error("RecallSessionProvider missing");
  return value;
}
export function useRecallSession(search: LearningSearch) {
  const { data, ready, error, update } = useRecallSessions();
  return {
    session: data.sessions[recallSessionId(search)] ?? emptyRecallSession,
    ready,
    storageError: error,
    update: (fn: (session: RecallSession) => RecallSession, requirePersistence = false) =>
      update(search, fn, requirePersistence),
  };
}
