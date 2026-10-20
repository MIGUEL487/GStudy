import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, Sparkles, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface SkeletonProps {
  onCancel?: () => void;
  backTo?: string;
  backSearch?: Record<string, unknown>;
  title?: string;
}

export function StageProgress({ stages }: { stages: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= stages.length - 1) return;
    const timer = setTimeout(() => {
      setIndex((curr) => Math.min(curr + 1, stages.length - 1));
    }, 1800);
    return () => clearTimeout(timer);
  }, [index, stages.length]);

  return (
    <div className="activity-stage-indicator" role="status" aria-live="polite">
      <div className="activity-stage-spinner">
        <Sparkles size={16} className="animate-spin text-muted-foreground" />
      </div>
      <span className="activity-stage-label text-sm font-medium">{stages[index]}</span>
    </div>
  );
}

export function QuizSkeleton({ onCancel, backTo, backSearch }: SkeletonProps) {
  const stages = [
    "Lendo seu material de estudo...",
    "Identificando conceitos centrais...",
    "Escrevendo perguntas e justificativas...",
  ];

  return (
    <div className="activity-skeleton quiz-skeleton" aria-label="Carregando quiz">
      <StageProgress stages={stages} />

      <div className="quiz-card-skeleton space-y-6 my-6 p-6 rounded-xl border border-border/50 bg-card/60">
        <div className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-4/5" />
        </div>

        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4].map((opt) => (
            <div
              key={opt}
              className="flex items-center gap-3 p-3.5 rounded-lg border border-border/40 bg-background/50"
            >
              <Skeleton className="h-6 w-6 rounded-full shrink-0" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>

      {(backTo || onCancel) && (
        <div className="flex justify-center mt-4">
          {backTo ? (
            <Link
              to={backTo}
              search={backSearch ?? {}}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 py-1 px-2.5 rounded-md hover:bg-muted/50"
            >
              <X size={14} />
              Cancelar e voltar para a trilha
            </Link>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
            >
              <X size={14} />
              Cancelar e voltar para a trilha
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function FlashcardsSkeleton({ onCancel, backTo, backSearch }: SkeletonProps) {
  const stages = [
    "Consultando anotações e referências...",
    "Sintetizando conceitos essenciais...",
    "Estruturando cartas de estudo...",
  ];

  return (
    <div className="activity-skeleton flashcard-skeleton" aria-label="Carregando flashcards">
      <StageProgress stages={stages} />

      <div className="flashcard-frame-skeleton my-8 mx-auto max-w-md h-64 rounded-2xl border border-border/60 bg-card/70 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="p-3 rounded-full bg-muted/60 text-muted-foreground">
          <BookOpen size={28} strokeWidth={1.5} />
        </div>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-36" />
      </div>

      {(backTo || onCancel) && (
        <div className="flex justify-center mt-4">
          {backTo ? (
            <Link
              to={backTo}
              search={backSearch ?? {}}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 py-1 px-2.5 rounded-md hover:bg-muted/50"
            >
              <X size={14} />
              Cancelar e voltar para a trilha
            </Link>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
            >
              <X size={14} />
              Cancelar e voltar para a trilha
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function ExplainSkeleton({ onCancel, backTo, backSearch }: SkeletonProps) {
  const stages = [
    "Mapeando estrutura do assunto...",
    "Formulando explicações pedagógicas com exemplos práticos...",
  ];

  return (
    <div className="activity-skeleton explain-skeleton" aria-label="Carregando explicações">
      <StageProgress stages={stages} />

      <div className="space-y-6 my-6 p-6 rounded-xl border border-border/50 bg-card/60">
        <Skeleton className="h-7 w-2/3" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <div className="p-4 rounded-lg bg-muted/40 space-y-2 border border-border/30">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>

      {(backTo || onCancel) && (
        <div className="flex justify-center mt-4">
          {backTo ? (
            <Link
              to={backTo}
              search={backSearch ?? {}}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 py-1 px-2.5 rounded-md hover:bg-muted/50"
            >
              <X size={14} />
              Cancelar e voltar para a trilha
            </Link>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
            >
              <X size={14} />
              Cancelar e voltar para a trilha
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
