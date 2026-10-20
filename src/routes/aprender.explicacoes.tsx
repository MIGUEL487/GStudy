import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, ArrowRight, BookOpen, Lightbulb } from "lucide-react";
import { awardXp } from "@/lib/learn-client";
import { learningSearch, type LearningSearch } from "@/lib/learning-model";
import { useLessonContext } from "@/components/learning-provider";
import { useGeneratedActivity } from "@/hooks/use-generated-activity";
import { LessonShell, Thinking, Finish, ErrorBox, UnavailableLesson } from "@/components/lesson";

export const Route = createFileRoute("/aprender/explicacoes")({
  validateSearch: learningSearch,
  head: () => ({
    meta: [
      { title: "GStudy · Explicações" },
      { name: "description", content: "Os conceitos do seu material explicados de forma simples." },
      { property: "og:title", content: "GStudy · Explicações" },
      { property: "og:description", content: "Entenda os conceitos com exemplos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExplainPage,
});
function ExplainPage() {
  return <ExplanationsLesson search={Route.useSearch()} />;
}

export function ExplanationsLesson({ search }: { search: LearningSearch }) {
  const lesson = useLessonContext(search);
  const enabled = lesson.ready && lesson.allowed && (!search.p || Boolean(lesson.context));
  const {
    result,
    error,
    reload: load,
  } = useGeneratedActivity("explain", search.m, lesson.context, enabled);
  const data = result?.mode === "explain" ? result.explain : null;
  const [i, setI] = useState(0);
  const completed = useRef(false);
  useEffect(() => {
    setI(0);
    completed.current = false;
  }, [data]);
  const shell = { title: "Entenda os conceitos", backSearch: lesson.backSearch };
  if (lesson.ready && !enabled)
    return (
      <LessonShell progress={0} {...shell}>
        <UnavailableLesson backSearch={lesson.backSearch} />
      </LessonShell>
    );
  if (error)
    return (
      <LessonShell progress={0} {...shell}>
        <ErrorBox message={error} retry={load} />
      </LessonShell>
    );
  if (!data)
    return (
      <LessonShell progress={0} {...shell}>
        <Thinking text="Organizando conceitos e exemplos que fazem sentido…" />
      </LessonShell>
    );
  const topic = data.topics[i];
  if (!topic)
    return (
      <LessonShell progress={1} {...shell}>
        <Finish
          xp={15}
          title="As ideias ganharam forma."
          line={`Você explorou ${data.topics.length} conceitos. Agora, vamos recuperar essas ideias com os flashcards.`}
          again={load}
          next={lesson.next}
          backSearch={lesson.backSearch}
        />
      </LessonShell>
    );
  const advance = () => {
    if (i + 1 >= data.topics.length && !completed.current) {
      if (search.p && !lesson.complete("explain")) return;
      completed.current = true;
      void awardXp(15);
    }
    setI((n) => Math.min(data.topics.length, n + 1));
  };
  return (
    <LessonShell progress={i / data.topics.length} {...shell}>
      <div className="lesson-body" key={i}>
        <div className="activity-intro">
          <BookOpen size={18} aria-hidden="true" />
          <span>Entenda a ideia antes de memorizar.</span>
        </div>
        <small className="lesson-kicker">
          CONCEITO {i + 1} DE {data.topics.length}
          {lesson.topic ? ` · ${lesson.topic.title}` : ""}
        </small>
        <h1 className="lesson-q">{topic.title}</h1>
        <div className="explain-card prose prose-sm">
          <ReactMarkdown>{topic.explanation}</ReactMarkdown>
        </div>
        <div className="explain-example">
          <b>
            <Lightbulb size={16} aria-hidden="true" />A ideia na prática
          </b>
          <ReactMarkdown>{topic.example}</ReactMarkdown>
        </div>
      </div>
      <div className="lesson-foot">
        {i > 0 && (
          <button className="duo-btn ghost" onClick={() => setI((n) => n - 1)}>
            <ArrowLeft size={16} aria-hidden="true" />
            Conceito anterior
          </button>
        )}
        <button className="duo-btn" onClick={advance}>
          {i + 1 === data.topics.length ? "Concluir leitura" : "Próximo conceito"}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </LessonShell>
  );
}
