import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  ExternalLink,
  FileText,
  GraduationCap,
  Medal,
  Search,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { useStudy } from "@/components/study-provider";
import { useLearning } from "@/components/learning-provider";
import { SubjectIcon } from "@/components/subject-icon";
import { PreparationDashboard } from "@/components/preparation-dashboard";
import { GoalDial } from "@/components/goal-dial";
import { AddMaterial } from "@/components/learning-materials";
import { Thinking } from "@/components/lesson";
import { useMaterials } from "@/lib/learn-client";
import { notebookNotes, type LearningPlan } from "@/lib/learning-model";
import { createPreparationPath, researchPreparation } from "@/lib/preparation.functions";
import {
  preparationKinds,
  preparationSearch,
  preparationProgress,
  preparationPreferences,
  type PreparationKind,
  type PreparationResearch,
} from "@/lib/preparation-model";
import { schoolYearLabel, schoolYears } from "@/lib/school-year";
import "@/styles/preparation.css";

export const Route = createFileRoute("/preparar")({
  validateSearch: preparationSearch,
  head: () => ({
    meta: [
      { title: "GStudy · Rumo à prova" },
      {
        name: "description",
        content: "Defina seu objetivo e crie uma preparação para provas, concursos e olimpíadas.",
      },
    ],
  }),
  component: PreparationRoute,
});
const stages = ["Seu desafio", "Sua matéria", "Conversa com a IA", "Sua meta"];
const kindIcons = { prova: GraduationCap, concurso: Trophy, olimpiada: Medal };

function PreparationRoute() {
  const search = Route.useSearch();
  return <PreparationPage key={search.p || "new"} search={search} />;
}

export function PreparationPage({ search = {} }: { search?: { p?: string | undefined } } = {}) {
  const { data, ready: studyReady, update } = useStudy();
  const { plans, ready, savePlan } = useLearning();
  const { items, reload } = useMaterials();
  const navigate = useNavigate();
  const researchFn = useServerFn(researchPreparation),
    createFn = useServerFn(createPreparationPath);
  const [stage, setStage] = useState(0),
    [kind, setKind] = useState<PreparationKind>("prova");
  const [year, setYear] = useState<string | null>(null),
    [exam, setExam] = useState(""),
    [edition, setEdition] = useState("");
  const [subjectId, setSubjectId] = useState(""),
    [resolvedSubject, setResolvedSubject] = useState(""),
    [resolvedFocus, setResolvedFocus] = useState(""),
    [showSubjectStep, setShowSubjectStep] = useState(false),
    [focus, setFocus] = useState(""),
    [program, setProgram] = useState("");
  const [notebooks, setNotebooks] = useState<string[]>([]),
    [picked, setPicked] = useState<string[]>([]);
  const [research, setResearch] = useState<PreparationResearch | null>(null),
    [answers, setAnswers] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [target, setTarget] = useState(80),
    [examDate, setExamDate] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<LearningPlan | null>(null);
  const lock = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  const subject = data.subjects.find((item) => item.id === subjectId),
    schoolYear = year ?? data.schoolYear ?? "";
  const saved = plans.filter((plan) => plan.preparation);
  const details = {
    kind,
    exam: exam.trim(),
    edition: edition.trim(),
    schoolYear,
    subject: resolvedSubject || subject?.name || (kind !== "prova" ? "Programa completo" : ""),
    focus: focus.trim() || resolvedFocus,
  };
  const go = (next: number) => {
    setStage(next);
    setError("");
    setDraft(null);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    });
  };
  const toggle = (id: string, values: string[], set: (next: string[]) => void) => {
    if (!values.includes(id) && values.length >= 20) {
      setError("Escolha até 20 materiais.");
      return;
    }
    set(values.includes(id) ? values.filter((item) => item !== id) : [...values, id]);
    setDraft(null);
  };
  const start = () => {
    if (!schoolYear || exam.trim().length < 2) {
      setError("Escolha sua etapa de estudo e dê um nome ao desafio.");
      return;
    }
    if (data.schoolYear !== schoolYear && !update((value) => ({ ...value, schoolYear }))) {
      setError("Não foi possível salvar seu ano escolar. Tente novamente.");
      return;
    }
    setYear(schoolYear);
    void investigate("");
  };
  const investigate = async (subjectName = subject?.name ?? "") => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await researchFn({
        data: {
          ...details,
          subject: subjectName,
          focus: focus.trim(),
          availableSubjects: data.subjects.map((item) => item.name),
        },
      });
      if (result.scope?.needsSubject) {
        setShowSubjectStep(true);
        go(1);
        return;
      }
      const inferred = result.scope?.subject || subjectName || "Programa completo";
      setResolvedSubject(inferred);
      setSubjectId(
        data.subjects.find(
          (item) => item.name.toLocaleLowerCase("pt-BR") === inferred.toLocaleLowerCase("pt-BR"),
        )?.id || "",
      );
      setResolvedFocus(result.scope?.focus || "");
      if (stage === 0) setShowSubjectStep(false);
      setResearch(result);
      go(2);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível preparar as perguntas agora. Tente novamente.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const create = async () => {
    if (lock.current || !details.subject || !research || target < 1) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      let next = draft;
      if (!next) {
        const cadernos = data.subjects
          .map((item) => notebookNotes(item, notebooks))
          .filter(Boolean)
          .join("\n\n");
        const notes = [program.trim(), cadernos].filter(Boolean).join("\n\n");
        if (notes.length > 22000)
          throw new Error(
            "Selecione menos cadernos ou reduza o roteiro: use até 22 mil caracteres de conteúdo.",
          );
        const preparation = {
          kind,
          exam: exam.trim(),
          edition: edition.trim(),
          schoolYear,
          focus: focus.trim() || resolvedFocus,
          target,
          ...(examDate ? { examDate } : {}),
          answers: answers.trim(),
          research,
          dailyMinutes,
        };
        const result = await createFn({ data: { ...details, preparation, notes, ids: picked } });
        const planId = crypto.randomUUID();
        next = {
          id: planId,
          subjectId: subject?.id || "preparation:" + planId,
          subject: details.subject,
          topic: (
            exam.trim() + (details.focus ? " · " + details.focus : " · " + details.subject)
          ).slice(0, 200),
          overview: result.overview,
          materialIds: picked,
          notes: [
            "Preparação: " + exam.trim(),
            "Etapa: " + schoolYearLabel(schoolYear),
            "Meta desejada: " + target + "% de acertos (não é nota obtida).",
            "Edição/nível/cargo: " + edition.trim(),
            examDate ? "Data da prova: " + examDate : "",
            "Foco: " + details.focus,
            "Orientação para as atividades: " + result.brief,
            "Respostas do estudante: " + answers.trim(),
            notes,
          ]
            .filter(Boolean)
            .join("\n\n"),
          topics: result.topics.map((topic) => ({ ...topic, id: crypto.randomUUID() })),
          completed: {},
          createdAt: new Date().toISOString(),
          preparation: { ...preparation, guide: result.guide },
        };
        setDraft(next);
      }
      if (!savePlan(next)) {
        setError(
          "O plano está pronto, mas não foi possível salvar. Tente salvar novamente; não é preciso gerar outra vez.",
        );
        return;
      }
      await navigate({ to: "/preparar", search: { p: next.id } });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível criar a preparação agora.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!ready || !studyReady) return <Thinking text="Abrindo sua preparação…" />;
  const selected = saved.find((plan) => plan.id === search.p);
  if (selected) return <PreparationDashboard key={selected.id} plan={selected} />;
  const stageIds = showSubjectStep ? [0, 1, 2, 3] : [0, 2, 3];
  const stepIndex = stageIds.indexOf(stage);
  return (
    <div className="preparation-page">
      <header className="prep-heading">
        <div>
          <h1>Seu próximo grande passo.</h1>
          <p>Um plano, boas referências e um próximo passo claro para a sua conquista.</p>
        </div>
        <span className="prep-compass" aria-hidden="true">
          <Compass size={36} strokeWidth={1.2} />
        </span>
      </header>
      {search.p && (
        <p className="form-error" role="alert">
          Este plano não foi encontrado na sua conta. Confira a sincronização ou abra um dos seus
          objetivos abaixo.
        </p>
      )}
      <ol className="prep-steps" aria-label="Etapas da preparação">
        {stageIds.map((id, index) => (
          <li
            key={id}
            className={stepIndex === index ? "is-current" : stepIndex > index ? "is-done" : ""}
            aria-current={stepIndex === index ? "step" : undefined}
          >
            <span>{stepIndex > index ? <Check size={15} /> : index + 1}</span>
            <b>{stages[id]}</b>
          </li>
        ))}
      </ol>
      <div className={"prep-layout " + (stage === 3 ? "has-goal" : "")}>
        <section className="prep-card" aria-busy={busy}>
          <div className="prep-stage" key={stage}>
            <span className="prep-kicker">
              PASSO {String(stepIndex + 1).padStart(2, "0")} DE{" "}
              {String(stageIds.length).padStart(2, "0")}
            </span>
            <h2 ref={heading} tabIndex={-1}>
              {
                [
                  "O que você quer conquistar?",
                  "O que vamos estudar?",
                  "Vamos conhecer seu desafio.",
                  "Até onde você quer chegar?",
                ][stage]
              }
            </h2>
            {stage === 0 && (
              <>
                <p className="prep-intro">
                  Me conte um pouco sobre você. A preparação começa pelo seu momento.
                </p>
                <label className="form-label">
                  Em que ano você está?
                  <select
                    className="form-input"
                    aria-label="Em que ano você está?"
                    value={schoolYear}
                    onChange={(event) => {
                      setYear(event.target.value);
                      setResearch(null);
                    }}
                  >
                    <option value="">Escolha seu ano ou etapa</option>
                    {schoolYears.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <small className="prep-caption">
                  Você pode alterar isso depois em{" "}
                  <Link to="/configuracoes" search={{ tab: "profile" }}>
                    Configurações / Perfil
                  </Link>
                  .
                </small>
                <fieldset className="prep-kinds">
                  <legend>Para qual tipo de desafio?</legend>
                  {(Object.keys(preparationKinds) as PreparationKind[]).map((value) => {
                    const Icon = kindIcons[value];
                    return (
                      <label key={value} className={kind === value ? "is-picked" : ""}>
                        <input
                          type="radio"
                          name="preparation-kind"
                          value={value}
                          checked={kind === value}
                          onChange={() => {
                            setKind(value);
                            setEdition("");
                            setSubjectId("");
                            setResolvedSubject("");
                            setResolvedFocus("");
                            setFocus("");
                            setShowSubjectStep(false);
                            setResearch(null);
                          }}
                        />
                        <Icon size={22} strokeWidth={1.5} />
                        <span>
                          <b>{preparationKinds[value].title}</b>
                          <small>{preparationKinds[value].description}</small>
                        </span>
                        <span className="prep-choice-dot" />
                      </label>
                    );
                  })}
                </fieldset>
                <label className="form-label">
                  {kind === "prova"
                    ? "Qual é a prova?"
                    : kind === "concurso"
                      ? "Qual é o concurso ou vestibular?"
                      : "Qual é a olimpíada?"}
                  <input
                    className="form-input"
                    value={exam}
                    onChange={(event) => {
                      setExam(event.target.value);
                      setResolvedSubject("");
                      setResolvedFocus("");
                      setSubjectId("");
                      setResearch(null);
                    }}
                    maxLength={140}
                    placeholder={
                      kind === "prova"
                        ? "Ex.: prova bimestral de Matemática"
                        : kind === "concurso"
                          ? "Ex.: ENEM, Fuvest ou concurso do Banco do Brasil"
                          : "Ex.: OBMEP, OBA ou Olimpíada de Química"
                    }
                  />
                </label>
                {kind === "prova" && (
                  <label className="form-label">
                    Conteúdo da prova <span>(se já souber)</span>
                    <textarea
                      className="form-input"
                      rows={2}
                      maxLength={600}
                      value={focus}
                      onChange={(event) => {
                        setFocus(event.target.value);
                        setResearch(null);
                      }}
                      placeholder="Ex.: equações e porcentagem. Se o nome da prova já diz o conteúdo, pode deixar vazio."
                    />
                  </label>
                )}
                {kind !== "prova" && (
                  <label className="form-label">
                    Edição, nível, instituição ou cargo <span>(se souber)</span>
                    <input
                      className="form-input"
                      value={edition}
                      maxLength={160}
                      onChange={(event) => {
                        setEdition(event.target.value);
                        setResearch(null);
                      }}
                      placeholder="Ex.: edição 2027, nível 2 · ou cargo e banca"
                    />
                  </label>
                )}
              </>
            )}
            {stage === 1 && (
              <>
                <p className="prep-intro">
                  Qual matéria entra nesta preparação? Vamos montar um caminho focado nela.
                </p>
                <div className="prep-subjects" role="group" aria-label="Matéria da preparação">
                  {data.subjects.map((item) => (
                    <button
                      type="button"
                      aria-pressed={subjectId === item.id}
                      className={subjectId === item.id ? "is-picked" : ""}
                      key={item.id}
                      disabled={busy}
                      onClick={() => {
                        setSubjectId(item.id);
                        setNotebooks([]);
                        setResearch(null);
                      }}
                    >
                      <SubjectIcon name={item.name} size={23} />
                      <span>{item.name}</span>
                      {subjectId === item.id && <Check size={15} />}
                    </button>
                  ))}
                </div>
                {!data.subjects.length && (
                  <p>
                    Adicione uma matéria na <Link to="/">página inicial</Link> para começar.
                  </p>
                )}
                <label className="form-label">
                  Algum assunto em especial? <span>(opcional)</span>
                  <textarea
                    className="form-input"
                    rows={3}
                    maxLength={600}
                    disabled={busy}
                    value={focus}
                    onChange={(event) => {
                      setFocus(event.target.value);
                      setResearch(null);
                    }}
                    placeholder="Ex.: geometria, interpretação de texto ou todo o conteúdo desse nível"
                  />
                </label>
                <p className="prep-inline-note">
                  <Search size={18} />
                  {kind === "prova"
                    ? "A IA vai perguntar sobre o conteúdo das aulas. O roteiro do professor pode ser adicionado no último passo."
                    : "A IA vai buscar informações sobre o desafio e mostrar as fontes que conseguir consultar."}
                </p>
              </>
            )}
            {stage === 2 && research && (
              <>
                <ResearchReport research={research} />
                <label className="form-label">
                  Suas respostas para a IA
                  <textarea
                    className="form-input"
                    value={answers}
                    onChange={(event) => setAnswers(event.target.value)}
                    maxLength={5000}
                    rows={5}
                    placeholder="Responda às perguntas acima. Conte também o que já sabe e onde sente mais dificuldade."
                  />
                </label>
                <small className="prep-caption">
                  Se a IA encontrou uma dúvida sobre edição, nível ou cargo, volte e complete o
                  desafio para pesquisar novamente.
                </small>
              </>
            )}
            {stage === 3 && (
              <>
                <p className="prep-intro">
                  Escolha a porcentagem de acertos que você quer buscar. A IA usará essa meta para
                  ajustar a profundidade da prática.
                </p>
                <GoalDial
                  value={target}
                  disabled={busy}
                  onChange={(value) => {
                    setTarget(value);
                    setDraft(null);
                  }}
                />
                <p className="prep-caption centered">
                  É uma meta de estudo, não uma previsão de nota ou aprovação.
                </p>
                <label className="form-label">
                  Quando será a prova? <span>(opcional)</span>
                  <input
                    className="form-input"
                    type="date"
                    value={examDate}
                    disabled={busy}
                    onChange={(event) => {
                      setExamDate(event.target.value);
                      setDraft(null);
                    }}
                  />
                </label>
                <label className="form-label">
                  Quanto tempo você tem por dia?
                  <select
                    className="form-input"
                    value={dailyMinutes}
                    disabled={busy}
                    onChange={(event) => {
                      setDailyMinutes(Number(event.target.value));
                      setDraft(null);
                    }}
                  >
                    {[...new Set([15, 30, 45, 60, 90, 120, 180, dailyMinutes])]
                      .sort((a, b) => a - b)
                      .map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes} minutos por dia
                        </option>
                      ))}
                  </select>
                </label>
                <p className="prep-caption">
                  Seu roteiro combina aulas no YouTube, leituras, resolução e revisão. As sessões
                  cabem nesse tempo; você escolhe quando realizá-las.
                </p>
                <details className="prep-materials">
                  <summary>
                    <FileText size={17} /> Personalizar com meu conteúdo
                  </summary>
                  <p>
                    Use o roteiro do professor, trechos do edital ou resumos. A preparação pode
                    começar sem material, mas o conteúdo oficial ajuda a delimitar o que cai.
                  </p>
                  <label className="form-label">
                    Roteiro, edital ou anotações
                    <textarea
                      className="form-input"
                      rows={4}
                      value={program}
                      disabled={busy}
                      maxLength={10000}
                      onChange={(event) => {
                        setProgram(event.target.value);
                        setDraft(null);
                      }}
                      placeholder="Cole o conteúdo que você precisa estudar…"
                    />
                  </label>
                  {data.subjects
                    .flatMap((item) => item.notebooks)
                    .filter((item) => item.text.trim())
                    .map((item) => (
                      <label className="prep-source" key={item.id}>
                        <input
                          type="checkbox"
                          checked={notebooks.includes(item.id)}
                          disabled={busy}
                          onChange={() => toggle(item.id, notebooks, setNotebooks)}
                        />
                        <BookOpen size={16} />
                        <span>
                          {item.title}
                          <small>
                            {item.id.startsWith("notion:") ? "Caderno do Notion" : "Seu caderno"}
                          </small>
                        </span>
                      </label>
                    ))}
                  {items?.map((item) => (
                    <label className="prep-source" key={item.id}>
                      <input
                        type="checkbox"
                        checked={picked.includes(item.id)}
                        disabled={busy}
                        onChange={() => toggle(item.id, picked, setPicked)}
                      />
                      <FileText size={16} />
                      <span>
                        {item.title}
                        <small>Material da sua conta</small>
                      </span>
                    </label>
                  ))}
                  <details className="prep-upload">
                    <summary>Adicionar PDF, link ou resumo</summary>
                    <AddMaterial onAdded={() => void reload()} />
                  </details>
                </details>
              </>
            )}
          </div>
          {busy && (
            <div className="prep-wait" role="status">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>
                {stage < 2
                  ? kind === "prova"
                    ? "Preparando suas perguntas…"
                    : "Conhecendo o desafio e preparando as perguntas…"
                  : "Organizando sua preparação…"}
              </span>
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="prep-actions">
            {stage > 0 && (
              <button
                type="button"
                className="duo-btn ghost"
                disabled={busy}
                onClick={() => go(stage === 2 && !showSubjectStep ? 0 : stage - 1)}
              >
                <ArrowLeft size={16} />
                Voltar
              </button>
            )}
            <button
              type="button"
              className="duo-btn"
              disabled={busy || (stage === 1 && !subject) || (stage === 3 && target < 1)}
              onClick={() => {
                if (stage === 0) start();
                else if (stage === 1) void investigate();
                else if (stage === 2) {
                  const preferences = preparationPreferences(answers);
                  if (preferences.dailyMinutes) setDailyMinutes(preferences.dailyMinutes);
                  if (preferences.target) setTarget(preferences.target);
                  go(3);
                } else void create();
              }}
            >
              {stage === 0
                ? "Continuar"
                : stage === 1
                  ? "Conversar com a IA"
                  : stage === 2
                    ? "Escolher minha meta"
                    : draft
                      ? "Tentar salvar plano"
                      : "Montar meu plano"}
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
        <aside className="prep-aside">
          <span className="prep-aside-icon">
            <Sparkles size={25} strokeWidth={1.4} />
          </span>
          <span className="prep-kicker">DO SEU JEITO</span>
          <h2>Ambição com direção.</h2>
          <p>
            Primeiro entendemos seu objetivo. Depois transformamos o conteúdo em passos que fazem
            sentido para você.
          </p>
          <div className="prep-recap">
            <span>
              <GraduationCap size={16} />
              {schoolYear ? schoolYearLabel(schoolYear) : "Sua etapa de estudo"}
            </span>
            <span>
              <Compass size={16} />
              {exam.trim() || "Seu próximo desafio"}
            </span>
            <span>
              <BookOpen size={16} />
              {details.subject || "Conteúdo informado ou identificado pela IA"}
            </span>
            <span>
              <Target size={16} />
              Meta de {target}% de aproveitamento
            </span>
          </div>
          <div className="prep-rhythm">
            <span>Descobrir, estudar e conquistar</span>
            <p>
              Uma curadoria de vídeos e livros, sessões que cabem no seu dia e um mapa do que
              estudar. Seu roteiro fica salvo na sua conta.
            </p>
          </div>
        </aside>
      </div>
      {!!saved.length && (
        <section className="prep-saved">
          <div className="section-heading">
            <h2>Seus desafios em andamento</h2>
            <span>{saved.length} preparação(ões)</span>
          </div>
          <div>
            {saved.map((plan) => {
              const progress = preparationProgress(plan);
              return (
                <Link
                  key={plan.id}
                  to="/preparar"
                  search={{ p: plan.id }}
                  className="prep-saved-card"
                >
                  <span className="prep-saved-icon">
                    <Trophy size={23} strokeWidth={1.3} />
                  </span>
                  <div>
                    <small>
                      {plan.subject} · meta {plan.preparation!.target}%
                    </small>
                    <h3>{plan.preparation!.exam}</h3>
                    <p>
                      {progress.total
                        ? `${progress.done} de ${progress.total} sessões concluídas`
                        : "Abra para descobrir o novo roteiro"}
                    </p>
                  </div>
                  <ArrowRight size={18} />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export function ResearchReport({ research }: { research: PreparationResearch }) {
  return (
    <div className="prep-research">
      <div className={"prep-research-label is-" + research.mode}>
        <Search size={15} />
        {research.mode === "web"
          ? "Com fontes da web"
          : research.mode === "school"
            ? "Orientação para a prova da escola"
            : "Orientação geral · programa atual não confirmado"}
      </div>
      <div className="prep-report">
        <ReactMarkdown
          components={{ a: ({ children }) => <span>{children}</span>, img: () => null }}
        >
          {research.report}
        </ReactMarkdown>
      </div>
      {!!research.sources.length && (
        <div className="prep-research-sources">
          <h3>Fontes consultadas</h3>
          <p>Confira se o programa corresponde à sua edição, nível ou cargo.</p>
          {research.sources.map((source) => (
            <a href={source.url} key={source.url} target="_blank" rel="noopener noreferrer">
              {source.title}
              <ExternalLink size={13} />
            </a>
          ))}
          <small>
            Consulta em{" "}
            {new Date(research.researchedAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
          </small>
        </div>
      )}
    </div>
  );
}
