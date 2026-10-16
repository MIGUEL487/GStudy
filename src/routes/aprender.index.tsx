import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, type CSSProperties, type FormEvent } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Clock3, FileText, Flame, Gem, Layers, Lightbulb, LockKeyhole, Map, PenTool, Plus, RotateCcw, Sparkles, Target, Trash2, Trophy, Users } from 'lucide-react';
import { useStudy } from '@/components/study-provider';
import { useLearning } from '@/components/learning-provider';
import { SubjectIcon, subjectColor } from '@/components/subject-icon';
import { AddMaterial, MaterialCard } from '@/components/learning-materials';
import { Thinking } from '@/components/lesson';
import { createLearningPath } from '@/lib/learning.functions';
import { useMaterials, useStats, levelOf } from '@/lib/learn-client';
import { activities, activityOrder, activityUnlocked, isCompleted, learningSearch, notebookNotes, planProgress, topicUnlocked, type ActivityMode, type LearningPlan } from '@/lib/learning-model';
import { normalizeStudyName } from '@/lib/notion-model';
import { useDailyAttempt } from '@/hooks/use-daily-attempt';
import '@/styles/learning-path.css';

export const Route = createFileRoute('/aprender/')({ validateSearch: learningSearch, head: () => ({ meta: [{ title: 'GStudy · Sua jornada de aprendizagem' }, { name: 'description', content: 'Uma trilha personalizada por matéria, com seis formas de aprender e uma revisão visual.' }] }), component: LearnHub });
const icons = { explain: Lightbulb, flashcards: Layers, quiz: Target, recall: Clock3, feynman: Users, review: PenTool };
const colorStyle = (name: string) => ({ '--subject-color': subjectColor(name) } as CSSProperties);

export function LearnHub() {
  const { data, ready: studyReady } = useStudy();
  const { plans, ready, savePlan, removePlan } = useLearning();
  const { items, reload, remove } = useMaterials();
  const stats = useStats(); const level = levelOf(stats.xp);
  const search = Route.useSearch(); const navigate = useNavigate();
  const [subjectId, setSubjectId] = useState('');
  const [topic, setTopic] = useState(''); const [picked, setPicked] = useState<string[]>([]); const [notebooks, setNotebooks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const createPath = useServerFn(createLearningPath);
  const subject = data.subjects.find(s => s.id === subjectId);
  const plan = plans.find(p => p.id === search.p);
  const chooseSubject = (id: string) => {
    const selected = data.subjects.find(s => s.id === id); setSubjectId(id); setTopic(''); setError('');
    setNotebooks(selected?.notebooks.filter(n => n.text.trim()).slice(0, 4).map(n => n.id) ?? []);
    setPicked(items?.filter(m => selected && normalizeStudyName(m.title).includes(normalizeStudyName(selected.name))).slice(0, 20).map(m => m.id) ?? []);
  };
  const create = async (event: FormEvent) => {
    event.preventDefault(); if (!subject || busy) return;
    setError(''); setBusy(true);
    try {
      const notes = notebookNotes(subject, notebooks);
      const result = await createPath({ data: { subject: subject.name, topic: topic.trim(), ids: picked, notes } });
      const next: LearningPlan = { id: crypto.randomUUID(), subjectId: subject.id, subject: subject.name, topic: topic.trim(), overview: result.overview, materialIds: picked, notes, topics: result.topics.map(t => ({ ...t, id: crypto.randomUUID() })), completed: {}, createdAt: new Date().toISOString() };
      if (savePlan(next)) await navigate({ to: '/aprender', search: { p: next.id } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível criar sua trilha agora.'); }
    finally { setBusy(false); }
  };
  const toggle = (id: string, values: string[], set: (v: string[]) => void) => {
    if (!values.includes(id) && values.length >= 20) { setError('Escolha no máximo 20 materiais por trilha.'); return; }
    set(values.includes(id) ? values.filter(v => v !== id) : [...values, id]);
  };
  if (!studyReady || !ready) return <Thinking text="Abrindo sua jornada…" />;
  return <div className="learning-hub">
    <div className="journey-eyebrow"><span className="eyebrow">TESTE SEU CONHECIMENTO</span><span><Sparkles size={13} /> Aprender é construir</span></div>
    <div className="journey-heading"><div><h1>{plan ? 'Um conceito de cada vez.' : subject ? 'Qual será sua descoberta?' : 'O que vamos aprender hoje?'}</h1><p>{plan ? 'Entenda, pratique e explique. Cada passo abre uma nova conexão.' : subject ? 'Você escolhe o assunto. A IA organiza o caminho.' : 'Escolha uma das suas matérias para começar uma trilha com a sua cara.'}</p></div><div className="journey-stats"><span title="Dias seguidos"><Flame size={17} /> {stats.streak}</span><span title="Experiência total"><Gem size={17} /> {stats.xp} XP</span><span title={`${100-level.into} XP para o próximo nível`}><Trophy size={17} /> Nível {level.level}</span></div></div>
    {plan ? <>
      <div className="journey-actions"><Link to="/aprender" search={{}} className="back-link"><ArrowLeft size={14} /> Trocar matéria ou assunto</Link><button className="text-action" onClick={() => { if (confirm(`Excluir a trilha “${plan.topic}”? Seus cadernos e materiais serão mantidos.`) && removePlan(plan.id)) void navigate({ to: '/aprender', search: {} }); }}><Trash2 size={14} /> Excluir trilha</button></div>
      <PlanTrail plan={plan} />
    </> : subject ? <>
      <button className="back-link" onClick={() => { setSubjectId(''); setError(''); }} disabled={busy}><ArrowLeft size={14} /> Escolher outra matéria</button>
      <div className="journey-builder" style={colorStyle(subject.name)}>
        <form className="topic-builder" onSubmit={e => void create(e)}>
          <span className="journey-step">PASSO 02 · SEU ASSUNTO</span>
          <div className="selected-subject"><SubjectIcon name={subject.name} size={25} /><span>{subject.name}</span></div>
          <h2>Por onde você quer começar?</h2>
          <label className="form-label" htmlFor="learning-topic">O que você quer estudar?<input id="learning-topic" className="form-input" placeholder="Ex.: matemática básica ou teorema de Pitágoras" value={topic} onChange={e => setTopic(e.target.value)} maxLength={200} minLength={2} required disabled={busy} /></label>
          <p className="builder-note"><Sparkles size={17} /> Personalize do seu jeito: use resumos, cadernos, cursos e PDFs. Você também pode começar só com o assunto.</p>
          <div className="source-summary"><BookOpen size={16} /><span>{notebooks.length} caderno(s) e {picked.length} material(is) selecionado(s)</span></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="duo-btn" disabled={busy || topic.trim().length < 2}>{busy ? <><span className="dots" aria-hidden="true"><i /><i /><i /></span> Organizando sua trilha…</> : <><Map size={17} /> Criar minha trilha <ArrowRight size={16} /></>}</button>
          <small>A IA pode cometer erros. Confira conceitos e fórmulas nas suas fontes.</small>
        </form>
        <aside className="journey-sources">
          <div className="source-heading"><span className="journey-step">PERSONALIZE O CONTEÚDO</span><FileText size={17} /></div>
          <h2>Seu material, seu caminho.</h2><p>Selecione o que a IA deve usar nesta trilha. Materiais de outras matérias ficam de fora.</p>
          {subject.notebooks.some(n => n.text.trim()) && <div className="notebook-sources"><h3>Cadernos de {subject.name}</h3>{subject.notebooks.filter(n => n.text.trim()).map(n => <label key={n.id}><input type="checkbox" checked={notebooks.includes(n.id)} disabled={busy} onChange={() => toggle(n.id, notebooks, setNotebooks)} /><BookOpen size={15} /><span>{n.title}<small>{n.id.startsWith('notion:') ? 'Importado do Notion · conteúdo disponível para a IA' : 'Suas anotações'}</small></span></label>)}</div>}
          <div className="notion-learning-note"><BookOpen size={18} /><p>Suas páginas do Notion viram cadernos e podem entrar aqui como fonte.<Link to="/configuracoes" search={{ tab: 'notion' }}>Conectar ou importar páginas <ArrowRight size={12} /></Link></p></div>
          {subject.courses.length > 0 && <details className="source-details"><summary>Seus cursos <ChevronDown size={14} /></summary><p>Importe o link público abaixo ou envie suas notas/PDF. Vídeos e páginas privadas precisam de um resumo.</p>{subject.courses.map(c => <a key={c.id} href={c.url} target="_blank" rel="noopener noreferrer">{c.title} <ArrowRight size={13} /></a>)}</details>}
          <details className="source-details"><summary>Adicionar resumo, PDF ou link <Plus size={16} /></summary><AddMaterial onAdded={() => void reload()} /></details>
          <div className="material-list">{items === null ? <p role="status">Carregando seus materiais…</p> : !items.length ? <p className="material-empty">Ainda não há arquivos ou resumos. Você pode criar a trilha pelo assunto e personalizar a próxima com seus materiais.</p> : items.map(item => <MaterialCard key={item.id} m={item} on={picked.includes(item.id)} toggle={() => !busy && toggle(item.id, picked, setPicked)} remove={() => { if (!busy && confirm(`Apagar “${item.title}”?`)) void remove(item.id); }} />)}</div>
        </aside>
      </div>
    </> : <>
      {search.p && <p className="form-error" role="alert">Esta trilha não foi encontrada na sua conta. Verifique a sincronização ou escolha uma matéria para continuar.</p>}
      <div className="journey-section-label"><span>PASSO 01</span><h2>Escolha sua matéria</h2><span className="journey-section-line" /></div>
      <div className="learning-subject-grid">{data.subjects.map((s, index) => <button className="learning-subject" key={s.id} onClick={() => chooseSubject(s.id)} style={{ ...colorStyle(s.name), '--stagger': `${index * 50}ms` } as CSSProperties}><span className="subject-outline"><SubjectIcon name={s.name} size={28} /></span><span><strong>{s.name}</strong><small>{s.notebooks.length} caderno(s) · {plans.filter(p => p.subjectId === s.id).length} trilha(s)</small></span><ArrowRight size={18} /></button>)}</div>
      {!data.subjects.length && <div className="journey-empty"><BookOpen size={34} /><h2>Sua primeira matéria começa no início.</h2><Link to="/" className="duo-btn">Adicionar matéria</Link></div>}
      {!!plans.length && <section className="saved-journeys"><div className="section-heading"><h2>Continue de onde parou</h2><span>{plans.length} trilha(s)</span></div><div className="saved-journey-grid">{plans.map(p => { const progress = planProgress(p); return <Link to="/aprender" search={{ p: p.id }} key={p.id} className="saved-journey" style={colorStyle(p.subject)}><SubjectIcon name={p.subject} size={21} /><div><small>{p.subject}</small><h3>{p.topic}</h3><span className="lesson-bar small"><span style={{ width: `${progress.done / progress.total * 100}%` }} /></span><small>{progress.done} de {progress.total} etapas concluídas</small></div><ArrowRight size={17} /></Link>; })}</div></section>}
      <div className="journey-footer-note"><Map size={18} /><p>Seis formas de aprender em cada tópico. Uma descoberta por vez.<small>Trilhas e progresso são sincronizados com sua conta; uma cópia fica neste aparelho para uso offline.</small></p></div>
    </>}
  </div>;
}

function PlanTrail({ plan }: { plan: LearningPlan }) {
  const progress = planProgress(plan);
  return <div className="path-layout" style={colorStyle(plan.subject)}>
    <aside className="path-overview"><span className="subject-outline"><SubjectIcon name={plan.subject} size={30} /></span><span className="journey-step">{plan.subject}</span><h2>{plan.topic}</h2>{plan.preparation && <div className="path-preparation"><span><Target size={15} />Meta de aproveitamento: <strong>{plan.preparation.target}%</strong></span><small>Meta desejada de acertos · não é uma nota obtida</small>{plan.preparation.edition && <small>{plan.preparation.edition}</small>}{plan.preparation.examDate && <small>Prova: {new Date(plan.preparation.examDate + 'T12:00:00').toLocaleDateString('pt-BR')}</small>}<Link to="/preparar"><ArrowLeft size={13} /> Minhas preparações</Link></div>}<p>{plan.overview}</p><div className="path-progress"><span>{Math.round(progress.done / progress.total * 100)}% da jornada</span><div className="lesson-bar small"><span style={{ width: `${progress.done / progress.total * 100}%` }} /></div><small>{progress.done} de {progress.total} etapas</small></div><div className="path-rhythm"><Clock3 size={17} /><p>Seu ritmo importa.<small>Até 2 tentativas de cada atividade por dia. Gerações que falham não contam.</small></p></div><details><summary>Como usar suas fontes <ChevronDown size={14} /></summary><p>Esta trilha usa {plan.materialIds.length} material(is){plan.notes ? ' e os cadernos selecionados' : ''}. Para mudar o conteúdo, crie outra trilha com os novos resumos, PDFs ou páginas do Notion.</p></details><Link to="/aprender" search={{}} className="duo-btn ghost"><Plus size={15} /> Criar outra trilha</Link></aside>
    <div className="topic-path">{plan.topics.map((topic, index) => {
      const unlocked = topicUnlocked(plan, index); const done = activityOrder.filter(mode => isCompleted(plan, topic.id, mode)).length;
      return <section className={`path-topic ${unlocked ? '' : 'is-locked'} ${done === activityOrder.length ? 'is-mastered' : ''}`} key={topic.id}>
        <header><span className="topic-number">{done === activityOrder.length ? <Check size={21} /> : String(index + 1).padStart(2, '0')}</span><div><small>TÓPICO {index + 1} · {done}/{activityOrder.length}</small><h2>{topic.title}</h2><p>{topic.goal}</p></div>{!unlocked && <LockKeyhole size={18} />}</header>
        <div className="topic-activities">{activityOrder.map((mode, step) => {
          const Icon = icons[mode]; const completed = isCompleted(plan, topic.id, mode); const canStart = activityUnlocked(plan, topic.id, mode); const a = activities[mode];
          const content = <><span className="activity-orb">{completed ? <Check size={23} /> : canStart ? <Icon size={23} /> : <LockKeyhole size={18} />}</span><span className="activity-label"><small>ETAPA {step + 1}</small><b>{a.title}</b><span>{a.description}</span>{canStart && <AttemptCount mode={mode} />}</span>{completed ? <RotateCcw size={14} /> : canStart ? <ArrowRight size={16} /> : null}</>;
          return canStart ? <Link key={mode} to={a.to} search={{ p: plan.id, t: topic.id, m: plan.materialIds.join(',') || undefined }} className={`path-activity ${completed ? 'is-completed' : 'is-current'} step-${step}`}>{content}</Link> : <div key={mode} className={`path-activity is-locked step-${step}`} aria-label={`${a.title}: conclua a etapa anterior`}>{content}</div>;
        })}</div>
        {done === activityOrder.length && <div className="topic-mastered"><Trophy size={16} /> Conexão construída. Você concluiu este tópico!</div>}
      </section>;
    })}{progress.done === progress.total && <div className="journey-complete"><Trophy size={38} /><h2>O conhecimento agora é seu.</h2><p>Você concluiu todas as etapas de {plan.topic}. Continue explorando ou volte amanhã para revisar.</p></div>}</div>
  </div>;
}
function AttemptCount({ mode }: { mode: ActivityMode }) { const { remaining } = useDailyAttempt(mode); return <em className={remaining ? '' : 'quota-empty'}>{remaining ? `${remaining} tentativa(s) hoje` : 'Limite diário atingido · volte amanhã'}</em>; }
