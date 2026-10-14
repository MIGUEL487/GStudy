import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { awardXp } from '@/lib/learn-client';
import { useGeneratedActivity } from '@/hooks/use-generated-activity';
import { LessonShell, Thinking, Finish, ErrorBox } from '@/components/lesson';

export const Route = createFileRoute('/aprender/explicacoes')({
  validateSearch: (s: Record<string, unknown>) => ({ m: typeof s['m'] === 'string' ? s['m'] : undefined }),
  head: () => ({ meta: [{ title: 'GStudy · Explicações' }, { name: 'description', content: 'Os conceitos do seu material explicados de forma simples.' }, { property: 'og:title', content: 'GStudy · Explicações' }, { property: 'og:description', content: 'Entenda os conceitos com exemplos.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: ExplainPage,
});

function ExplainPage() {
  const { m } = Route.useSearch();
  const { result, error, reload: load } = useGeneratedActivity('explain', m);
  const data = result?.mode === 'explain' ? result.explain : null;
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [data]);
  if (error) return <LessonShell progress={0} title="Explicações"><ErrorBox message={error} retry={load} /></LessonShell>;
  if (!data) return <LessonShell progress={0} title="Explicações"><Thinking text="Preparando explicações simples…" /></LessonShell>;
  const t = data.topics[i];
  if (!t) return <LessonShell progress={1} title="Explicações"><Finish xp={15} title="Conceitos desbloqueados!" line={`Você revisou ${data.topics.length} conceitos. Que tal testar no quiz?`} again={load} /></LessonShell>;
  return <LessonShell progress={i / data.topics.length} title="Explicações">
    <div className="lesson-body" key={i}>
      <small className="lesson-kicker">CONCEITO {i + 1} DE {data.topics.length}</small>
      <h1 className="lesson-q">{t.title}</h1>
      <div className="explain-card prose prose-sm"><ReactMarkdown>{t.explanation}</ReactMarkdown></div>
      <div className="explain-example"><b>💡 Exemplo</b><ReactMarkdown>{t.example}</ReactMarkdown></div>
    </div>
    <div className="lesson-foot">
      {i > 0 && <button className="duo-btn ghost" onClick={() => setI(i - 1)}>Voltar</button>}
      <button className="duo-btn" onClick={() => { if (i + 1 >= data.topics.length) void awardXp(15); setI(i + 1); }}>Entendi!</button>
    </div>
  </LessonShell>;
}
