import { Link, useLocation } from "@tanstack/react-router";
import { ArrowRight, Brain } from "lucide-react";
import { useRecallSessions } from "./recall-session-provider";

export function RecallResume() {
  const { data, ready } = useRecallSessions();
  const path = useLocation({ select: (l) => l.pathname });
  const session = Object.values(data.sessions)
    .filter((s) => ["loading", "study", "recall", "grading"].includes(s.phase))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!ready || !session || path === "/aprender/recall") return null;
  return (
    <Link to="/aprender/recall" search={session.search} className="recall-resume">
      <Brain size={20} />
      <span>
        <strong>Continuar Active Recall</strong>
        <small>{session.topic || "Sua sessão de estudo"} · seu conteúdo está guardado</small>
      </span>
      <ArrowRight size={18} />
    </Link>
  );
}
