import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  Clock,
  Gem,
  Heart,
  RotateCcw,
  Sparkles,
  Trophy,
  Wind,
  X,
} from "lucide-react";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { m, useReducedMotion } from "motion/react";
import type { LearningSearch } from "@/lib/learning-model";
import { useHearts } from "./hearts-provider";
import "@/styles/hearts-and-trophy.css";

export type LessonDestination = { to: string; search: LearningSearch };

export function useLessonHearts() {
  const account = useHearts();
  const hearts = account?.state?.hearts ?? 0;
  const [shaking, setShaking] = useState(false);
  const [showMinusOne, setShowMinusOne] = useState(false);

  const deductHeart = async (eventId: string) => {
    if (!account) return false;
    const saved = await account.lose(eventId);
    if (!saved) return false;
    setShaking(true);
    setShowMinusOne(true);

    setTimeout(() => setShaking(false), 350);
    setTimeout(() => setShowMinusOne(false), 600);
    return true;
  };

  const rechargeHearts = () => {
    void account?.refresh();
  };

  return {
    hearts,
    shaking,
    showMinusOne,
    isExhausted: hearts <= 0,
    deductHeart,
    rechargeHearts,
    ready: Boolean(account?.state),
    error: account?.error ?? "Não foi possível consultar seus corações.",
    pending: account?.pending ?? false,
    countdown: account?.countdown ?? "",
  };
}

export function LessonHeartsIndicator({
  hearts,
  shaking = false,
  showMinusOne = false,
}: {
  hearts: number;
  shaking?: boolean;
  showMinusOne?: boolean;
}) {
  return (
    <span
      className="lesson-hearts lesson-hearts-container"
      aria-label={`${hearts} vidas restantes`}
    >
      <span className={`lesson-hearts-icon ${shaking ? "shaking" : ""}`} aria-hidden="true">
        <Heart size={18} fill={hearts > 0 ? "currentColor" : "none"} strokeWidth={1.8} />
      </span>
      <span>{hearts}</span>
      {showMinusOne && <span className="heart-loss-bubble">-1</span>}
    </span>
  );
}

export function BreathPauseScreen({
  onRecharge,
  onReview,
  countdown,
  backTo = "/aprender",
  backSearch,
}: {
  onRecharge?: () => void;
  onReview?: () => void;
  countdown?: string;
  backTo?: "/aprender" | "/preparar";
  backSearch?: LearningSearch;
}) {
  return (
    <div className="breath-pause-container" role="region" aria-label="Pausa para respirar">
      <div className="breath-pause-icon" aria-hidden="true">
        <Wind size={32} />
      </div>

      <h2 className="breath-pause-title">Um intervalo para aprender</h2>
      <p className="breath-pause-message">
        Suas respostas estão salvas. Você pode revisar os erros agora e retomar quando recuperar um
        coração.
      </p>
      <p role="status">{countdown}</p>

      <div className="breath-pause-actions">
        {onRecharge && (
          <button
            type="button"
            className="duo-btn w-full justify-center"
            onClick={onRecharge}
            autoFocus
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span>Verificar corações</span>
          </button>
        )}
        {onReview && (
          <button type="button" className="duo-btn ghost" onClick={onReview}>
            Revisar erros sem custo
          </button>
        )}

        <Link
          to={backTo}
          search={backSearch ?? {}}
          className="duo-btn ghost w-full justify-center border border-border"
        >
          <span>{backTo === "/preparar" ? "Voltar ao plano" : "Voltar à trilha"}</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export function LessonShell({
  progress,
  children,
  hearts,
  shakingHearts,
  title,
  backSearch,
  backTo = "/aprender",
}: {
  progress: number;
  children: ReactNode;
  hearts?: number;
  shakingHearts?: boolean;
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
        {hearts !== undefined && <LessonHeartsIndicator hearts={hearts} shaking={shakingHearts} />}
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
  summary,
}: {
  xp: number;
  title: string;
  line: string;
  again: () => void;
  next?: LessonDestination | undefined;
  backSearch?: LearningSearch | undefined;
  backTo?: "/aprender" | "/preparar";
  summary?: string;
}) {
  const [animatedXp, setAnimatedXp] = useState(0);
  const primaryBtnRef = useRef<HTMLAnchorElement>(null);
  const reduced = useReducedMotion();

  // Efeito de contagem animada do XP suavemente
  useEffect(() => {
    if (reduced) {
      setAnimatedXp(xp);
      return;
    }
    let startTimestamp: number | null = null;
    let frame = 0;
    const duration = 750; // ms

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setAnimatedXp(Math.round(progress * xp));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [xp, reduced]);

  // Autofocus no botão de continuar jornada
  useEffect(() => {
    primaryBtnRef.current?.focus();
  }, []);

  return (
    <div className="lesson-finish trophy-finish-card">
      <m.div
        className="trophy-burst-icon"
        initial={{ scale: 0.8, rotate: -8, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 350, damping: 22 }}
      >
        <Trophy size={42} strokeWidth={1.4} />
      </m.div>

      <small className="lesson-kicker">MAIS UM PASSO NA SUA TRILHA</small>
      <h1>{title}</h1>
      <p className="page-subtitle">{line}</p>

      {summary && (
        <div className="p-3 mb-4 rounded-md bg-surface border border-border text-xs text-muted-foreground max-w-sm mx-auto">
          {summary}
        </div>
      )}

      <div className="trophy-counter-display" aria-label={`Pontuação desta prática: ${xp}`}>
        {animatedXp} <span className="text-xl font-normal text-muted-foreground">pontos</span>
      </div>

      <div className="finish-stats">
        <div>
          <Gem size={19} aria-hidden="true" />
          <strong>{xp}</strong>
          <small>Pontos nesta atividade</small>
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
          <span>Praticar de novo</span>
        </button>
        <Link
          ref={primaryBtnRef}
          to={(next?.to ?? backTo) as "/aprender"}
          search={next?.search ?? backSearch ?? {}}
          className="duo-btn"
          tabIndex={0}
        >
          <span>
            {next
              ? "Próxima atividade"
              : backTo === "/preparar"
                ? "Voltar ao plano"
                : "Continuar jornada"}
          </span>
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>

      <p className="activity-finish-note">
        XP e ofensiva são registrados pelo servidor, respeitando os limites da conta.
      </p>
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
