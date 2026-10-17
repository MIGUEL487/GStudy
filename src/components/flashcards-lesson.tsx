import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, Layers3, RotateCcw, RotateCw } from "lucide-react";
import { awardXp } from "@/lib/learn-client";
import { type LearningSearch } from "@/lib/learning-model";
import { useLessonContext } from "@/components/learning-provider";
import { useGeneratedActivity } from "@/hooks/use-generated-activity";
import { LessonShell, Thinking, Finish, ErrorBox, UnavailableLesson } from "@/components/lesson";

type Card = { front: string; back: string };
export function FlashcardsLesson({ search }: { search: LearningSearch }) {
  const lesson = useLessonContext(search);
  const enabled = lesson.ready && lesson.allowed && (!search.p || Boolean(lesson.context));
  const {
    result,
    error,
    reload: load,
    remaining,
  } = useGeneratedActivity("flashcards", search.m, lesson.context, enabled);
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [total, setTotal] = useState(0);
  const [known, setKnown] = useState(0);
  const [flip, setFlip] = useState(false);
  const [round, setRound] = useState(0);
  const answering = useRef(false);
  useEffect(() => {
    setKnown(0);
    setFlip(false);
    setRound(0);
    answering.current = false;
    if (result?.mode === "flashcards") {
      setQueue(result.cards.cards);
      setTotal(result.cards.cards.length);
    } else {
      setQueue(null);
      setTotal(0);
    }
  }, [result]);
  useEffect(() => {
    answering.current = false;
  }, [queue]);
  const shell = { title: "Flashcards", backSearch: lesson.backSearch, backTo: lesson.backTo };
  if (lesson.ready && !enabled)
    return (
      <LessonShell progress={0} {...shell}>
        <UnavailableLesson backSearch={lesson.backSearch} backTo={lesson.backTo} />
      </LessonShell>
    );
  if (error)
    return (
      <LessonShell progress={0} {...shell}>
        <ErrorBox message={error} retry={load} />
      </LessonShell>
    );
  if (!queue)
    return (
      <LessonShell progress={0} {...shell}>
        <Thinking text="Preparando perguntas curtas e respostas claras…" />
      </LessonShell>
    );
  const card = queue[0];
  if (!card)
    return (
      <LessonShell progress={1} {...shell}>
        <Finish
          xp={total * 2}
          title="Conexões na memória!"
          line={`Você revisou e reconheceu as ${total} cartas deste baralho.`}
          again={load}
          next={lesson.next}
          backSearch={lesson.backSearch}
          backTo={lesson.backTo}
        />
      </LessonShell>
    );
  const answer = (got: boolean) => {
    if (answering.current) return;
    answering.current = true;
    const [current, ...rest] = queue;
    const next = got ? rest : [...rest, current!];
    if (!next.length && search.p && !lesson.complete("flashcards")) {
      answering.current = false;
      return;
    }
    setFlip(false);
    setRound((r) => r + 1);
    setQueue(next);
    if (got) setKnown((n) => n + 1);
    if (!next.length) void awardXp(total * 2);
  };
  return (
    <LessonShell progress={known / Math.max(1, total)} {...shell}>
      <div className="lesson-body">
        <div className="activity-intro">
          <Layers3 size={18} aria-hidden="true" />
          <span>Uma conexão de cada vez.</span>
          <span className="activity-card-count">
            {known} de {total} reconhecidas
          </span>
        </div>
        <small className="lesson-kicker">{lesson.topic?.title ?? "MEMORIZE COM CALMA"}</small>
        <button
          className="activity-flashcard"
          data-face={flip ? "answer" : "question"}
          onClick={() => setFlip((f) => !f)}
          aria-pressed={flip}
          aria-describedby="flashcard-hint"
        >
          <span className="flashcard-side">
            <RotateCw size={14} aria-hidden="true" />
            {flip ? "Resposta" : "Pergunta"}
          </span>
          <span key={`${round}-${flip}`} className="flashcard-copy">
            <ReactMarkdown>{flip ? card.back : card.front}</ReactMarkdown>
          </span>
        </button>
        <p id="flashcard-hint" className="activity-card-hint">
          {flip
            ? "Lembrou sem olhar? Escolha abaixo. As cartas difíceis voltam para o fim."
            : "Pense na resposta antes de tocar na carta. Use Enter ou espaço para virar."}
        </p>
      </div>
      <div className="lesson-foot">
        {flip ? (
          <>
            <button className="duo-btn ghost" onClick={() => answer(false)}>
              <RotateCcw size={16} aria-hidden="true" />
              Revisar depois
            </button>
            <button className="duo-btn" onClick={() => answer(true)}>
              <Check size={17} aria-hidden="true" />
              Eu lembrei
            </button>
          </>
        ) : (
          <button className="duo-btn" onClick={() => setFlip(true)}>
            Revelar resposta
            <RotateCw size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="activity-card-hint">
        {remaining} {remaining === 1 ? "novo baralho disponível" : "novos baralhos disponíveis"}{" "}
        hoje na sua conta.
      </p>
    </LessonShell>
  );
}
