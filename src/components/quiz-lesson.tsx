import { generateActivity } from "@/lib/learn.functions";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, CircleCheck, Compass, Lightbulb } from "lucide-react";
import { awardXp } from "@/lib/learn-client";
import { type LearningSearch } from "@/lib/learning-model";
import { useLessonContext } from "@/components/learning-provider";
import { useGeneratedActivity } from "@/hooks/use-generated-activity";
import { LessonShell, Finish, ErrorBox, UnavailableLesson } from "@/components/lesson";
import { QuizSkeleton } from "@/components/activity-skeletons";

export type QuizQuestion = {
  question: string;
  options: string[];
  answer: number;
  why: string;
};

/**
 * Filtra perguntas com índice de resposta inválido (não corrige com clamp)
 * e embaralha as opções no cliente ajustando o índice da correta.
 */
export function prepareQuizQuestions(
  rawQuestions: QuizQuestion[],
  randomFn = Math.random,
): QuizQuestion[] {
  const valid = rawQuestions.filter(
    (q) =>
      Number.isInteger(q.answer) &&
      q.answer >= 0 &&
      q.answer < q.options.length &&
      q.options.length >= 2,
  );

  return valid.map((q) => {
    const paired = q.options.map((opt, idx) => ({
      opt,
      isCorrect: idx === q.answer,
    }));

    // Fisher-Yates shuffle
    for (let k = paired.length - 1; k > 0; k--) {
      const j = Math.floor(randomFn() * (k + 1));
      const temp = paired[k]!;
      paired[k] = paired[j]!;
      paired[j] = temp;
    }

    const newAnswer = paired.findIndex((p) => p.isCorrect);

    return {
      ...q,
      options: paired.map((p) => p.opt),
      answer: newAnswer >= 0 ? newAnswer : 0,
    };
  });
}

export function QuizLesson({ search }: { search: LearningSearch }) {
  const lesson = useLessonContext(search);
  const enabled = lesson.ready && lesson.allowed && (!search.p || Boolean(lesson.context));
  const {
    result,
    error,
    reload: load,
  } = useGeneratedActivity("quiz", search.m, lesson.context, enabled);
  const quiz = result?.mode === "quiz" ? result.quiz : null;

  const questions = useMemo(
    () => (quiz?.questions ? prepareQuizQuestions(quiz.questions) : []),
    [quiz],
  );

  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [right, setRight] = useState(0);
  const [done, setDone] = useState(false);
  const action = useRef(false);

  useEffect(() => {
    setI(0);
    setPick(null);
    setChecked(false);
    setRight(0);
    setDone(false);
    action.current = false;
  }, [quiz]);

  useEffect(() => {
    action.current = false;
  }, [i, checked]);

  useEffect(() => {
    if (done && lesson.next) {
      void generateActivity({
        data: {
          mode: "flashcards",
          ids: (search.m ?? "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          ...(lesson.context ? { context: lesson.context } : {}),
        },
      }).catch(() => {});
    }
  }, [done, lesson.next, search.m, lesson.context]);

  const shell = { title: "Quiz", backSearch: lesson.backSearch, backTo: lesson.backTo };

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

  if (!quiz)
    return (
      <LessonShell progress={0} {...shell}>
        <QuizSkeleton backTo={lesson.backTo || "/aprender"} backSearch={lesson.backSearch ?? {}} />
      </LessonShell>
    );

  if (questions.length === 0)
    return (
      <LessonShell progress={0} {...shell}>
        <ErrorBox
          message="Nenhuma pergunta válida foi encontrada neste quiz. Tente gerar novamente."
          retry={load}
        />
      </LessonShell>
    );

  const q = questions[i];
  if (done || !q)
    return (
      <LessonShell progress={1} {...shell}>
        <Finish
          xp={right * 10 + 5}
          title="Cada tentativa ensina."
          line={`Você acertou ${right} de ${questions.length} perguntas e revisou as explicações. Continue construindo sua compreensão.`}
          again={load}
          next={lesson.next}
          backSearch={lesson.backSearch}
          backTo={lesson.backTo}
        />
      </LessonShell>
    );

  const ok = pick === q.answer;

  const check = () => {
    if (pick === null || action.current) return;
    action.current = true;
    setChecked(true);
    if (ok) setRight((n) => n + 1);
  };

  const next = () => {
    if (action.current) return;
    action.current = true;
    if (i + 1 >= questions.length) {
      if (search.p && !lesson.complete("quiz")) {
        action.current = false;
        return;
      }
      setDone(true);
      void awardXp(right * 10 + 5);
    } else {
      setI((n) => n + 1);
      setPick(null);
      setChecked(false);
    }
  };

  return (
    <LessonShell progress={i / questions.length} {...shell}>
      <div className="lesson-body" key={i}>
        <div className="activity-intro">
          <Compass size={18} aria-hidden="true" />
          <span>Errar também faz parte de aprender.</span>
        </div>
        <small className="lesson-kicker">
          PERGUNTA {i + 1} DE {questions.length}
          {lesson.topic ? ` · ${lesson.topic.title}` : ""}
        </small>
        <h1 className="lesson-q">{q.question}</h1>
        <div className="choices" role="group" aria-label="Alternativas">
          {q.options.map((option, k) => (
            <button
              key={k}
              disabled={checked}
              aria-pressed={pick === k}
              onClick={() => setPick(k)}
              className={`choice ${pick === k ? "picked" : ""} ${checked && k === q.answer ? "right" : ""} ${checked && pick === k && !ok ? "wrong" : ""}`}
            >
              <kbd aria-hidden="true">{String.fromCharCode(65 + k)}</kbd>
              <span>{option}</span>
              {checked && k === q.answer && (
                <Check className="choice-status" size={18} aria-label="Resposta correta" />
              )}
            </button>
          ))}
        </div>
      </div>
      <div className={`lesson-foot ${checked ? (ok ? "good" : "bad") : ""}`}>
        {checked && (
          <div className="foot-msg" role="status">
            <b>
              {ok ? (
                <CircleCheck size={20} aria-hidden="true" />
              ) : (
                <Lightbulb size={20} aria-hidden="true" />
              )}
              {ok ? "Você fez a conexão!" : "Vamos entender o porquê."}
            </b>
            <span>{q.why}</span>
          </div>
        )}
        <button className="duo-btn" disabled={pick === null} onClick={checked ? next : check}>
          {checked
            ? i + 1 === questions.length
              ? "Concluir quiz"
              : "Próxima pergunta"
            : "Conferir resposta"}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </LessonShell>
  );
}
