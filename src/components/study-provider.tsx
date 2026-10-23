import { normalizeAbsenceTotals } from "@/lib/attendance-model";
import type React from "react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { initialData, loadData, storageKey, type StudyData } from "@/lib/study-model";
import { signalAccountChange } from "@/lib/account-sync-model";

type StudyValue = {
  data: StudyData;
  ready: boolean;
  update: (fn: (d: StudyData) => StudyData) => boolean;
};

// Keep one context instance across hot reloads so provider and consumers always match.
const g = globalThis as { __gstudyContext?: React.Context<StudyValue | null> };
const StudyContext = (g.__gstudyContext ??= createContext<StudyValue | null>(null));

export function StudyProvider({ children, userId }: { children: ReactNode; userId?: string }) {
  const accountKey = userId ? `${storageKey}:${userId}` : storageKey;
  const [data, setData] = useState(initialData);
  const [ready, setReady] = useState(false);
  const current = useRef(data);
  const readable = useRef(true);

  useEffect(() => {
    try {
      const ownerKey = `${storageKey}.legacy-owner`;
      const owner = localStorage.getItem(ownerKey);
      const existing = localStorage.getItem(accountKey);
      const mayMigrate = !userId || !owner || owner === userId;
      const loaded = existing
        ? loadData({ getItem: (key) => (key === storageKey ? existing : null) })
        : mayMigrate
          ? loadData(localStorage)
          : initialData();
      if (userId && !existing) {
        localStorage.setItem(accountKey, JSON.stringify(loaded));
        if (!owner) localStorage.setItem(ownerKey, userId);
        signalAccountChange();
      }
      current.current = loaded;
      setData(loaded);
    } catch {
      readable.current = false;
      toast.error(
        "Não foi possível carregar os dados deste navegador. Não sobrescreveremos seus dados.",
      );
    } finally {
      setReady(true);
    }

    const sync = (event: StorageEvent) => {
      if (event.key !== accountKey) return;
      try {
        const raw = localStorage.getItem(accountKey);
        if (!raw) return;
        const loaded = loadData({ getItem: (key) => (key === storageKey ? raw : null) });
        current.current = loaded;
        setData(loaded);
        readable.current = true;
      } catch {
        toast.error("Os dados recebidos não puderam ser lidos. Sua cópia local foi preservada.");
      }
    };

    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [accountKey, userId]);

  const update = useCallback(
    (fn: (d: StudyData) => StudyData) => {
      try {
        if (!readable.current) {
          throw new Error("Os dados salvos precisam ser recuperados antes de continuar.");
        }
        const changed = fn(current.current);
        const prior = current.current;
        const next =
          changed.attendance !== prior.attendance ||
          changed.schedule !== prior.schedule ||
          changed.schoolDays !== prior.schoolDays ||
          changed.attendancePeriods !== prior.attendancePeriods ||
          changed.attendanceYear !== prior.attendanceYear ||
          changed.performance !== prior.performance
            ? normalizeAbsenceTotals(changed)
            : changed;
        localStorage.setItem(accountKey, JSON.stringify(next));
        current.current = next;
        setData(next);
        signalAccountChange();
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível salvar. Verifique o armazenamento do navegador.",
        );
        return false;
      }
    },
    [accountKey],
  );

  return <StudyContext.Provider value={{ data, ready, update }}>{children}</StudyContext.Provider>;
}

export function useStudy() {
  const context = useContext(StudyContext);
  if (!context) throw new Error("StudyProvider missing");
  return context;
}

export function useOptionalStudy() {
  return useContext(StudyContext);
}
