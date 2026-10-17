import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { Clock3, LockKeyhole, Minus, ArrowRight } from "lucide-react";
import { useRecallSessions } from "./recall-session-provider";
import { learningSearch } from "@/lib/learning-model";
import { recallSessionId } from "@/lib/recall-session";
const activityPaths = [
  "/aprender/explicacoes",
  "/aprender/flashcards",
  "/aprender/quiz",
  "/aprender/feynman",
  "/aprender/recall",
  "/aprender/revisao",
  "/preparar/questoes",
  "/preparar/flashcards",
];
function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 500);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}
export function useTestFocus() {
  const path = useLocation({ select: (l) => l.pathname }),
    search = learningSearch(useSearch({ strict: false }) as Record<string, unknown>);
  const { data } = useRecallSessions();
  const now = useNow();
  const session = data.sessions[recallSessionId(search)];
  return (
    activityPaths.includes(path) &&
    !(
      path === "/aprender/recall" &&
      session?.phase === "study" &&
      session.deadline !== null &&
      session.deadline > now
    )
  );
}
export function FocusSessionHeader() {
  const path = useLocation({ select: (location) => location.pathname });
  const search = learningSearch(useSearch({ strict: false }) as Record<string, unknown>);
  return (
    <div className="focus-session-header">
      <span>
        <LockKeyhole size={14} />
        Modo foco
      </span>
      <Link
        to={path.startsWith("/preparar/") ? "/preparar" : "/aprender"}
        search={search.p ? { p: search.p } : {}}
      >
        Sair do teste <ArrowRight size={14} />
      </Link>
    </div>
  );
}
export function RecallTimerPopup() {
  const { data, ready, update } = useRecallSessions();
  const now = useNow();
  const path = useLocation({ select: (l) => l.pathname }),
    navigate = useNavigate();
  const focused = useTestFocus();
  const [compact, setCompact] = useState(false);
  const expired = useRef(new Set<string>());
  const entry = Object.entries(data.sessions)
    .filter(([, s]) => ["study", "recall", "grading"].includes(s.phase))
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)[0];
  const id = entry?.[0],
    session = entry?.[1];
  const left = session?.deadline ? Math.max(0, session.deadline - now) : 0;
  useEffect(() => {
    if (
      !session ||
      !id ||
      session.phase !== "study" ||
      left > 0 ||
      expired.current.has(`${id}:${session.deadline}`)
    )
      return;
    expired.current.add(`${id}:${session.deadline}`);
    update(session.search, (s) => ({ ...s, phase: "recall" }));
    if (!activityPaths.includes(path) || path === "/aprender/recall")
      void navigate({ to: "/aprender/recall", search: session.search, replace: true });
  }, [id, session?.deadline, session?.phase, left, path, navigate, update]);
  if (!ready || !session) return null;
  const seconds = Math.ceil(left / 1000),
    clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <aside
      className={`recall-timer-popup ${compact ? "is-compact" : ""}`}
      aria-label="Tempo do Active Recall"
    >
      <header>
        <Clock3 size={16} />
        <strong>Active Recall</strong>
        <button
          type="button"
          aria-label={compact ? "Expandir cronômetro" : "Recolher cronômetro"}
          aria-expanded={!compact}
          onClick={() => setCompact((v) => !v)}
        >
          <Minus size={16} />
        </button>
      </header>
      <div
        className="recall-popup-time"
        role="timer"
        aria-label="Tempo disponível no Active Recall"
      >
        {clock}
        <span>{left > 0 ? "para estudar" : "leitura encerrada"}</span>
      </div>
      {!compact && (
        <>
          <p>{session.topic}</p>
          <small>
            {left > 0
              ? "Pode consultar seus cadernos. O tempo continua contando."
              : "Agora é hora de escrever sem consultar suas notas."}
          </small>
          {path !== "/aprender/recall" && !focused && (
            <Link to="/aprender/recall" search={session.search}>
              Continuar sessão <ArrowRight size={14} />
            </Link>
          )}
        </>
      )}
    </aside>
  );
}
