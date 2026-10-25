import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, CircleCheck, Compass, Lightbulb } from "lucide-react";
import { awardXp } from "@/lib/learn-client";
import type { LearningSearch } from "@/lib/learning-model";
import {
  quizHeartEvent,
  quizPosition,
  quizDocumentKey,
  type QuizProgress,
} from "@/lib/quiz-progress";
import { savedQuiz, saveQuiz, readQuizDocument, quizUpdatedEvent } from "@/lib/quiz-store";
import { useLessonContext } from "./learning-provider";
import { useGeneratedActivity } from "@/hooks/use-generated-activity";
import { LessonShell, Finish, ErrorBox, UnavailableLesson, BreathPauseScreen } from "./lesson";
import { QuizSkeleton } from "./activity-skeletons";
import { ActivityStreamPreview } from "./activity-stream-preview";
import { useHearts } from "./hearts-provider";

export type QuizQuestion = { question: string; options: string[]; answer: number; why: string };
export function prepareQuizQuestions(raw: QuizQuestion[], random = Math.random): QuizQuestion[] {
  return raw
    .filter(
      (q) =>
        Number.isInteger(q.answer) &&
        q.answer >= 0 &&
        q.answer < q.options.length &&
        q.options.length >= 2,
    )
    .map((q) => {
      const options = q.options.map((text, i) => ({ text, correct: i === q.answer }));
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [options[i], options[j]] = [options[j]!, options[i]!];
      }
      return {
        ...q,
        options: options.map((o) => o.text),
        answer: options.findIndex((o) => o.correct),
      };
    });
}

export function QuizLesson({ search }: { search: LearningSearch }) {
  const account = useHearts();
  const user = account?.userId ?? "signed-out";
  const activity = JSON.stringify(search);
  return (
    <QuizSession key={`${user}:${activity}`} search={search} user={user} activity={activity} />
  );
}

function QuizSession({
  search,
  user,
  activity,
}: {
  search: LearningSearch;
  user: string;
  activity: string;
}) {
  const storageKey = `gstudy.quiz.v2:${user}:${activity}`;
  const lesson = useLessonContext(search);
  const hearts = useHearts();
  const [restored] = useState(() => savedQuiz(user, activity, storageKey));
  const [usingSaved, setUsingSaved] = useState(Boolean(restored.value));
  const [session, setSession] = useState<QuizProgress | null>(restored.value);
  const current = useRef(session);
  const [localError, setLocalError] = useState(restored.error);
  const [review, setReview] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncLock = useRef(false);
  const enabled = lesson.ready && lesson.allowed && (!search.p || Boolean(lesson.context));
  const generated = useGeneratedActivity(
    "quiz",
    search.m,
    lesson.context,
    enabled && !usingSaved && !restored.error,
  );
  const persist = useCallback(
    (next: QuizProgress) => {
      const previous = current.current;
      current.current = next;
      if (!saveQuiz(user, activity, next)) {
        current.current = previous;
        setLocalError(
          "Não foi possível salvar sua resposta. Libere espaço no navegador e tente novamente.",
        );
        return false;
      }
      current.current = next;
      setSession(next);
      setLocalError("");
      return true;
    },
    [user, activity],
  );
  const [history, setHistory] = useState<QuizProgress[]>([]);
  useEffect(() => {
    const refresh = () => {
      try {
        const rows = readQuizDocument(user).sessions.filter((row) => row.activity === activity);
        setHistory(rows.flatMap((row) => [row.progress, ...row.copies]));
        const local = current.current;
        if (!local) return;
        const incoming = rows.find((row) => row.id === local.sessionId)?.progress;
        if (
          incoming &&
          (quizPosition(incoming) > quizPosition(local) ||
            (quizPosition(incoming) === quizPosition(local) &&
              local.pendingHeartId &&
              !incoming.pendingHeartId))
        ) {
          current.current = incoming;
          setSession(incoming);
          setUsingSaved(true);
        }
      } catch {
        setLocalError("Não foi possível ler o histórico. Seus dados foram preservados.");
      }
    };
    const storage = (event: StorageEvent) => {
      if (event.key === quizDocumentKey(user)) refresh();
    };
    // Import the old per-activity cache without deleting its backup.
    try {
      if (
        restored.value &&
        !readQuizDocument(user).sessions.some((row) => row.id === restored.value!.sessionId)
      ) {
        if (!saveQuiz(user, activity, restored.value))
          setLocalError("Não foi possível salvar o quiz na conta deste aparelho.");
      }
    } catch {
      setLocalError("Não foi possível ler o histórico. Seus dados foram preservados.");
    }
    refresh();
    window.addEventListener("storage", storage);
    window.addEventListener(quizUpdatedEvent, refresh);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener(quizUpdatedEvent, refresh);
    };
  }, [user, activity, restored]);
  useEffect(() => {
    if (session || !enabled || generated.result?.mode !== "quiz") return;
    const questions = prepareQuizQuestions(generated.result.quiz.questions);
    if (!questions.length) {
      setLocalError("Nenhuma pergunta válida foi encontrada. Tente gerar novamente.");
      return;
    }
    persist({
      sessionId: crypto.randomUUID(),
      questions,
      index: 0,
      pick: null,
      checked: false,
      right: 0,
      done: false,
      mistakes: [],
      pendingHeartId: null,
    });
  }, [session, generated.result, enabled, persist]);

  const synchronize = useCallback(async () => {
    const eventId = current.current?.pendingHeartId;
    if (!eventId || !hearts || syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    try {
      if (await hearts.lose(eventId)) {
        const latest = current.current;
        if (latest?.pendingHeartId === eventId) persist({ ...latest, pendingHeartId: null });
      }
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }, [hearts?.lose, persist]);
  useEffect(() => {
    if (session?.pendingHeartId) void synchronize();
  }, [session?.pendingHeartId, synchronize]);

  const restart = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      setLocalError("Não foi possível iniciar outro quiz. Seu resultado foi preservado.");
      return;
    }
    current.current = null;
    setSession(null);
    setUsingSaved(false);
    setLocalError("");
    setReview(false);
    generated.reload();
  };
  const shell = { title: "Quiz", backSearch: lesson.backSearch, backTo: lesson.backTo };
  const questions = session?.questions ?? [];
  const mistakes = useMemo(
    () => session?.mistakes.map((index) => questions[index]!).filter(Boolean) ?? [],
    [session?.mistakes, questions],
  );
  const reviewContent = (
    <section aria-label="Revisão dos erros" className="quiz-error-review">
      <h2>Vamos rever suas respostas</h2>
      {mistakes.length ? (
        mistakes.map((q, index) => (
          <article key={index}>
            <h3>{q.question}</h3>
            <p>
              <b>Resposta: </b>
              {q.options[q.answer]}
            </p>
            <p>{q.why}</p>
          </article>
        ))
      ) : (
        <p>Você ainda não tem erros neste quiz.</p>
      )}
      <button type="button" className="duo-btn ghost" onClick={() => setReview(false)}>
        Voltar ao quiz
      </button>
    </section>
  );

  const savedHistory = (
    <>
      {history.length > 1 && (
        <details>
          <summary>Quizzes salvos e respostas preservadas</summary>
          {history.map((value, index) => (
            <button
              key={index}
              className="text-action"
              onClick={() => {
                if (persist({ ...value, sessionId: crypto.randomUUID() })) setUsingSaved(true);
              }}
            >
              Retomar quiz {index + 1} · pergunta {value.index + 1}
              {value.done ? " · concluído" : ""}
            </button>
          ))}
        </details>
      )}
    </>
  );

  if (lesson.ready && !enabled)
    return (
      <LessonShell progress={0} {...shell}>
        <UnavailableLesson backSearch={lesson.backSearch} backTo={lesson.backTo} />
      </LessonShell>
    );
  if (review)
    return (
      <LessonShell progress={(session?.index ?? 0) / Math.max(1, questions.length)} {...shell}>
        {reviewContent}
      </LessonShell>
    );
  if (!session && !restored.error && !localError && generated.partialItems?.length)
    return (
      <LessonShell progress={0} {...shell}>
        <ActivityStreamPreview
          items={generated.partialItems}
          loading={generated.loading}
          error={generated.error}
          stop={generated.stop}
          retry={generated.reload}
        />
      </LessonShell>
    );
  if (restored.error || localError || generated.error)
    return (
      <LessonShell progress={0} {...shell}>
        <ErrorBox
          message={restored.error || localError || generated.error}
          retry={
            restored.error
              ? () => window.location.reload()
              : session
                ? () => persist(session)
                : generated.reload
          }
        />
      </LessonShell>
    );
  if (!session)
    return (
      <LessonShell progress={0} {...shell}>
        <ActivityStreamPreview
          items={generated.partialItems}
          loading={generated.loading}
          stop={generated.stop}
        >
          <QuizSkeleton
            backTo={lesson.backTo || "/aprender"}
            backSearch={lesson.backSearch ?? {}}
          />
        </ActivityStreamPreview>
      </LessonShell>
    );
  if (session.done)
    return (
      <LessonShell progress={1} {...shell}>
        {savedHistory}
        <Finish
          xp={session.right * 10 + 5}
          title="Cada tentativa ensina."
          line={`Você acertou ${session.right} de ${questions.length} perguntas. Seu progresso está salvo.`}
          again={restart}
          next={lesson.next}
          backSearch={lesson.backSearch}
          backTo={lesson.backTo}
        />
        <button className="text-action" onClick={() => setReview(true)}>
          Revisar erros sem custo
        </button>
      </LessonShell>
    );
  if (!hearts?.state)
    return (
      <LessonShell progress={session.index / questions.length} {...shell}>
        <ErrorBox
          message={hearts?.error || "Consultando seus corações…"}
          retry={() => void hearts?.refresh()}
        />
        <button className="text-action" onClick={() => setReview(true)}>
          Revisar erros sem custo
        </button>
      </LessonShell>
    );
  if (hearts.state.hearts === 0 && !session.checked)
    return (
      <LessonShell progress={session.index / questions.length} hearts={0} {...shell}>
        <BreathPauseScreen
          countdown={hearts.countdown}
          onRecharge={() => void hearts.refresh()}
          onReview={() => setReview(true)}
          backTo={lesson.backTo}
          backSearch={lesson.backSearch}
        />
      </LessonShell>
    );

  const q = questions[session.index]!;
  const correct = session.pick === q.answer;
  const check = () => {
    const latest = current.current;
    if (
      !latest ||
      latest.checked ||
      latest.pick === null ||
      latest.pendingHeartId ||
      hearts.state!.hearts <= 0
    )
      return;
    const right = latest.pick === q.answer;
    persist({
      ...latest,
      checked: true,
      right: latest.right + Number(right),
      mistakes: right ? latest.mistakes : [...latest.mistakes, latest.index],
      pendingHeartId: right ? null : quizHeartEvent(latest.sessionId, latest.index),
    });
  };
  const next = () => {
    const latest = current.current;
    if (!latest?.checked || latest.pendingHeartId || syncing) return;
    if (latest.index + 1 === questions.length) {
      if (search.p && !lesson.complete("quiz")) return;
      if (persist({ ...latest, done: true }))
        void awardXp(latest.right * 10 + 5, "quiz", latest.sessionId);
    } else persist({ ...latest, index: latest.index + 1, pick: null, checked: false });
  };
  return (
    <LessonShell
      progress={session.index / questions.length}
      hearts={hearts.state.hearts}
      shakingHearts={session.checked && !correct}
      {...shell}
    >
      <div className="lesson-body">
        {savedHistory}
        <div className="activity-intro">
          <Compass size={18} aria-hidden="true" />
          <span>Errar também faz parte de aprender.</span>
        </div>
        <small className="lesson-kicker">
          Pergunta {session.index + 1} de {questions.length}
          {lesson.topic ? ` · ${lesson.topic.title}` : ""}
        </small>
        <h1 className="lesson-q">{q.question}</h1>
        <div className="choices" role="group" aria-label="Alternativas">
          {q.options.map((option, index) => (
            <button
              key={index}
              disabled={session.checked}
              aria-pressed={session.pick === index}
              onClick={() => persist({ ...session, pick: index })}
              className={`choice ${session.pick === index ? "picked" : ""} ${session.checked && index === q.answer ? "right" : ""} ${session.checked && session.pick === index && !correct ? "wrong" : ""}`}
            >
              <kbd aria-hidden="true">{String.fromCharCode(65 + index)}</kbd>
              <span>{option}</span>
              {session.checked && index === q.answer && (
                <Check className="choice-status" size={18} aria-label="Resposta correta" />
              )}
            </button>
          ))}
        </div>
      </div>
      <div className={`lesson-foot ${session.checked ? (correct ? "good" : "bad") : ""}`}>
        {session.checked && (
          <div className="foot-msg" role="status">
            <b>
              {correct ? <CircleCheck size={20} /> : <Lightbulb size={20} />}
              {correct ? "Você fez a conexão!" : "Vamos entender o porquê."}
            </b>
            <span>{q.why}</span>
          </div>
        )}
        {session.pendingHeartId && !syncing && (
          <ErrorBox
            message={hearts.error || "Sua resposta está salva. Falta sincronizar o coração."}
            retry={() => void synchronize()}
          />
        )}
        <button
          className="duo-btn"
          disabled={
            session.pick === null ||
            Boolean(session.pendingHeartId) ||
            syncing ||
            (!session.checked && Boolean(hearts.error))
          }
          onClick={session.checked ? next : check}
        >
          {syncing
            ? "Salvando…"
            : session.checked
              ? session.index + 1 === questions.length
                ? "Concluir quiz"
                : "Próxima pergunta"
              : "Conferir resposta"}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </LessonShell>
  );
}
