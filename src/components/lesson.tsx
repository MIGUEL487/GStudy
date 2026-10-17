import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  Gem,
  Heart,
  RotateCcw,
  Trophy,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { LearningSearch } from "@/lib/learning-model";

export type LessonDestination = { to: string; search: LearningSearch };

export function LessonShell({
  progress,
  children,
  hearts,
  title,
  backSearch,
  backTo = "/aprender",
}: {
  progress: number;
  children: ReactNode;
  hearts?: number;
  title: string;
  backSearch?: LearningSearch | undefined;
  backTo?: "/aprender" | "/preparar";
}) {
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <section className="lesson activity-lesson" aria-label={title}>
      <div className="lesson-top">
        <Link
          to={backTo}
          search={backSearch ?? {}}
          className="lesson-close"
          aria-label="Voltar para sua trilha"
        >
          <X size={19} />
        </Link>
        <div className="activity-progress">
          <div className="activity-progress-label">
            <span>{title}</span>
            <span>{percent}%</span>
          </div>
          <div
            className="lesson-bar"
            role="progressbar"
            aria-label={`Progresso em ${title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
        {hearts !== undefined && (
          <span className="lesson-hearts" aria-label={`${hearts} vidas`}>
            <Heart size={17} aria-hidden="true" /> {hearts}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export function Thinking({ text }: { text: string }) {
  return (
    <div className="lesson-thinking" role="status" aria-live="polite">
      <div className="activity-thinking-icon" aria-hidden="true">
        <BookOpen size={32} strokeWidth={1.4} />
      </div>
      <p>{text}</p>
      <span className="activity-thinking-hint">Preparando um estudo com a sua cara.</span>
      <div className="dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

export function Finish({
  xp,
  title,
  line,
  again,
  next,
  backSearch,
  backTo = "/aprender",
}: {
  xp: number;
  title: string;
  line: string;
  again: () => void;
  next?: LessonDestination | undefined;
  backSearch?: LearningSearch | undefined;
  backTo?: "/aprender" | "/preparar";
}) {
  return (
    <div className="lesson-finish">
      <div className="finish-burst" aria-hidden="true">
        <Trophy size={40} strokeWidth={1.35} />
      </div>
      <small className="lesson-kicker">MAIS UM PASSO NA SUA TRILHA</small>
      <h1>{title}</h1>
      <p className="page-subtitle">{line}</p>
      <div className="finish-stats">
        <div>
          <Gem size={19} aria-hidden="true" />
          <strong>+{xp}</strong>
          <small>XP de prática</small>
        </div>
        <div>
          <Check size={19} aria-hidden="true" />
          <strong>Concluído</strong>
          <small>no seu ritmo</small>
        </div>
      </div>
      <div className="activity-finish-actions">
        <button className="duo-btn ghost" onClick={again}>
          <RotateCcw size={16} aria-hidden="true" />
          Praticar de novo
        </button>
        <Link
          to={(next?.to ?? backTo) as "/aprender"}
          search={next?.search ?? backSearch ?? {}}
          className="duo-btn"
        >
          {next
            ? "Próxima atividade"
            : backTo === "/preparar"
              ? "Voltar ao plano"
              : "Voltar à trilha"}
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
      <p className="activity-finish-note">O aprendizado acontece a cada tentativa.</p>
    </div>
  );
}

export function ErrorBox({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="lesson-thinking activity-error" role="alert">
      <div className="activity-thinking-icon" aria-hidden="true">
        <CircleAlert size={30} strokeWidth={1.4} />
      </div>
      <p>{message}</p>
      <button className="duo-btn" onClick={retry}>
        <RotateCcw size={16} aria-hidden="true" />
        Tentar de novo
      </button>
    </div>
  );
}

export function UnavailableLesson({
  backSearch,
  backTo = "/aprender",
}: {
  backSearch: LearningSearch;
  backTo?: "/aprender" | "/preparar";
}) {
  return (
    <div className="lesson-thinking activity-error">
      <div className="activity-thinking-icon" aria-hidden="true">
        <CircleAlert size={30} strokeWidth={1.4} />
      </div>
      <p>
        Esta etapa ainda não está disponível. Volte à sua trilha para continuar pela próxima
        atividade.
      </p>
      <Link to={backTo} search={backSearch} className="duo-btn">
        Voltar à trilha
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </div>
  );
}
