import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import ReactMarkdown from 'react-markdown';
import { generateActivity, type Explain } from '@/lib/learn.functions';
import { awardXp, idsFrom } from '@/lib/learn-client';
import { LessonShell, Thinking, Finish, ErrorBox } from '@/components/lesson';

export const Route = createFileRoute('/aprender/explicacoes')({
  validateSearch: (s: Record<string, unknown>) => ({ m: typeof s['m'] === 'string' ? s['m'] : undefined }),
  head: () => ({ meta: [{ title: 'GStudy · Explicações' }, { name: 'description', content: 'Os conceitos do seu material explicados de forma simples.' }, { property: 'og:title', content: 'GStudy · Explicações' }, { property: 'og:description', content: 'Entenda os conceitos com exemplos.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: ExplainPage,
});

function ExplainPage() {
  const { m } = Route.useSearch();
  const gen = useServerFn(generateActivity);
  const [data, setData] = useState<Explain | null>(null); const [i, setI] = useState(0); const [error, setError] = useState('');
  const load = useCallback(() => { setData(null); setError(''); setI(0);
    gen({ data: { mode: 'explain', ids: idsFrom(m) } }).then(r => { if (r.mode === 'explain') setData(r.explain); }).catch(e => setError(e instanceof Error ? e.message : 'Erro ao gerar explicações.')); }, [gen, m]);
  useEffect(load, [load]);
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
