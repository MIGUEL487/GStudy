import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { learningRpc } from "@/lib/learning-rpc";
import { backendErrorMessage } from "@/lib/backend-errors";
import { heartsStateSchema, heartCountdown, type HeartsState } from "@/lib/hearts-model";

type HeartsContext = {
  userId: string;
  state: HeartsState | null;
  error: string;
  pending: boolean;
  countdown: string;
  refresh: () => Promise<void>;
  lose: (eventId: string) => Promise<boolean>;
};
const Context = createContext<HeartsContext | null>(null);
export function useHearts() {
  return useContext(Context);
}

export function HeartsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [state, setState] = useState<HeartsState | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const offset = useRef(0);
  const generation = useRef(0);
  const lastServerTime = useRef(0);
  const request = useCallback(async (eventId?: string) => {
    const current = generation.current;
    try {
      const { data, error: failure } = eventId
        ? await learningRpc("lose_learning_heart", { p_event_id: eventId })
        : await learningRpc("get_learning_hearts", {});
      if (failure)
        throw new Error(
          backendErrorMessage(
            failure,
            "Não foi possível atualizar seus corações. Tente novamente.",
          ),
        );
      const next = heartsStateSchema.parse(data);
      if (generation.current !== current) return false;
      if (Date.parse(next.server_now) < lastServerTime.current) return true;
      lastServerTime.current = Date.parse(next.server_now);
      offset.current = Date.parse(next.server_now) - Date.now();
      setState(next);
      setError("");
      setClock(Date.now());
      return true;
    } catch (cause) {
      if (generation.current === current)
        setError(
          cause instanceof Error && !(cause instanceof Error && cause.name === "ZodError")
            ? cause.message
            : "Não foi possível ler seus corações. Tente novamente.",
        );
      return false;
    }
  }, []);
  const refresh = useCallback(async () => {
    await request();
  }, [request]);
  const lose = useCallback(
    async (eventId: string) => {
      setPending(true);
      try {
        return await request(eventId);
      } finally {
        setPending(false);
      }
    },
    [request],
  );
  useLayoutEffect(() => {
    generation.current++;
    lastServerTime.current = 0;
    setState(null);
    setError("");
    void refresh();
    const id = setInterval(() => {
      setClock(Date.now());
      void refresh();
    }, 30000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      generation.current++;
      clearInterval(id);
      window.removeEventListener("focus", focus);
    };
  }, [userId, refresh]);
  const value = useMemo(
    () => ({
      userId,
      state,
      error,
      pending,
      countdown: heartCountdown(state?.next_at, clock + offset.current),
      refresh,
      lose,
    }),
    [userId, state, error, pending, clock, refresh, lose],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
