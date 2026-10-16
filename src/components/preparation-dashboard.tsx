import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Compass,
  ExternalLink,
  Flag,
  Layers,
  ListChecks,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import { useLearning } from "./learning-provider";
import { SubjectIcon } from "./subject-icon";
import { createPreparationPath } from "@/lib/preparation.functions";
import {
  preparationMissionKey,
  preparationProgress,
  preparationResourceLink,
  type PreparationGuide,
} from "@/lib/preparation-model";
import type { LearningPlan } from "@/lib/learning-model";
import { schoolYearLabel } from "@/lib/school-year";

const missionKinds = {
  watch: { label: "ASSISTIR & ANOTAR", icon: Play },
  read: { label: "LER & CONECTAR", icon: BookOpen },
  solve: { label: "RESOLVER & INVESTIGAR", icon: Target },
  review: { label: "REVISAR & AJUSTAR", icon: RotateCcw },
};
const tabs = [
  { id: "route", label: "Meu roteiro", icon: ListChecks },
  { id: "library", label: "Vídeos & livros", icon: BookOpen },
  { id: "map", label: "Mapa da prova", icon: Layers },
] as const;
type Tab = (typeof tabs)[number]["id"];

export function PreparationDashboard({ plan }: { plan: LearningPlan }) {
  const { savePreparationGuide, removePlan, setPreparationMission } = useLearning();
  const navigate = useNavigate();
  const generate = useServerFn(createPreparationPath);
  const preparation = plan.preparation!;
  const guide = preparation.guide;
  const progress = preparationProgress(plan);
  const percentage = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const nextIndex =
    guide?.missions.findIndex((_, index) => !plan.completed[preparationMissionKey(index)]) ?? -1;
  const next = nextIndex >= 0 ? guide?.missions[nextIndex] : undefined;
  const [tab, setTab] = useState<Tab>("route");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [draft, setDraft] = useState<PreparationGuide | null>(null);
  const upgrade = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let updated = draft;
      if (!updated) {
        const { guide: _guide, ...metadata } = preparation;
        const result = await generate({
          data: {
            kind: preparation.kind,
            exam: preparation.exam,
            edition: preparation.edition,
            schoolYear: preparation.schoolYear,
            subject: plan.subject,
            focus: preparation.focus,
            preparation: metadata,
            ids: plan.materialIds,
            notes: plan.notes,
            existingTopics: plan.topics.map(({ title, goal, challenge }) => ({
              title,
              goal,
              challenge,
            })),
          },
        });
        updated = result.guide;
        setDraft(updated);
      }
      if (!savePreparationGuide(plan.id, updated))
        throw new Error(
          "O novo roteiro está pronto, mas não foi salvo. Tente salvar novamente; não é preciso gerar outra vez.",
        );
      setDraft(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível criar seu roteiro agora.",
      );
    } finally {
      setBusy(false);
    }
  };
  const toggleMission = (index: number, done: boolean) => {
    setError("");
    if (!setPreparationMission(plan.id, index, done))
      setError("Não foi possível salvar a sessão. Tente novamente.");
  };
  return (
    <div className="preparation-page prep-dashboard">
      <div className="prep-dashboard-nav">
        <Link to="/preparar" search={{}} className="back-link">
          <ArrowLeft size={14} /> Meus objetivos
        </Link>
        <Link to="/preparar" search={{}} className="text-action">
          <Plus size={15} /> Novo objetivo
        </Link>
      </div>
      <header className="prep-command">
        <div className="prep-command-copy">
          <span className="prep-kicker">
            <Compass size={14} /> RUMO À PROVA ·{" "}
            {preparation.kind === "olimpiada"
              ? "OLIMPÍADA"
              : preparation.kind === "concurso"
                ? "CONCURSO / VESTIBULAR"
                : "PROVA DA ESCOLA"}
          </span>
          <h1>{preparation.exam}</h1>
          <p>{guide?.headline ?? "Seu objetivo agora tem um espaço só dele."}</p>
          <div className="prep-command-tags">
            <span>
              <SubjectIcon name={plan.subject} size={14} /> {plan.subject}
            </span>
            {preparation.edition && <span>{preparation.edition}</span>}
            <span>{schoolYearLabel(preparation.schoolYear)}</span>
          </div>
        </div>
        <div className="prep-target-badge">
          <Target size={23} strokeWidth={1.4} />
          <strong>
            {preparation.target}
            <small>%</small>
          </strong>
          <span>SUA META DE ACERTOS</span>
          <small>Uma intenção, não uma previsão.</small>
        </div>
      </header>
      <div className="prep-metrics">
        <div>
          <CalendarDays size={19} />
          <span>
            <small>Seu horizonte</small>
            <strong>
              {preparation.examDate
                ? new Date(preparation.examDate + "T12:00:00").toLocaleDateString("pt-BR")
                : "No seu ritmo"}
            </strong>
          </span>
        </div>
        <div>
          <Clock3 size={19} />
          <span>
            <small>Tempo disponível</small>
            <strong>{preparation.dailyMinutes ?? 30} min por dia</strong>
          </span>
        </div>
        <div>
          <Flag size={19} />
          <span>
            <small>Sessões concluídas</small>
            <strong>
              {progress.done}
              <em> / {progress.total || "—"}</em>
            </strong>
          </span>
        </div>
      </div>
      {!guide ? (
        <section className="prep-legacy">
          <span className="prep-aside-icon">
            <Sparkles size={24} />
          </span>
          <div>
            <span className="prep-kicker">UM NOVO JEITO DE SE PREPARAR</span>
            <h2>Sua prova merece mais que uma lista de testes.</h2>
            <p>
              Transforme este objetivo em um roteiro de estudos com aulas no YouTube, livros,
              resolução e revisão. Seus tópicos, materiais e progresso anterior serão preservados.
            </p>
            <button className="duo-btn" disabled={busy} onClick={() => void upgrade()}>
              {busy ? (
                <>
                  <span className="dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>{" "}
                  Montando seu roteiro…
                </>
              ) : draft ? (
                "Tentar salvar roteiro"
              ) : (
                <>
                  <Sparkles size={16} /> Descobrir meu novo roteiro
                </>
              )}
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="prep-tabs" role="tablist" aria-label="Seu plano de preparação">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                id={`prep-tab-${id}`}
                role="tab"
                aria-selected={tab === id}
                aria-controls="prep-panel"
                onClick={() => setTab(id)}
                tabIndex={tab === id ? 0 : -1}
                onKeyDown={(event) => {
                  const index = tabs.findIndex((item) => item.id === id);
                  const target =
                    event.key === "ArrowRight"
                      ? (index + 1) % tabs.length
                      : event.key === "ArrowLeft"
                        ? (index + tabs.length - 1) % tabs.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? tabs.length - 1
                            : null;
                  if (target !== null) {
                    event.preventDefault();
                    const next = tabs[target]!;
                    setTab(next.id);
                    document.getElementById(`prep-tab-${next.id}`)?.focus();
                  }
                }}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </div>
          <div
            id="prep-panel"
            role="tabpanel"
            aria-labelledby={`prep-tab-${tab}`}
            className="prep-dashboard-panel"
            key={tab}
          >
            {tab === "route" && (
              <div className="prep-route-layout">
                <div>
                  <section className="prep-next">
                    <span className="prep-kicker">
                      <Sparkles size={14} /> {next ? "SEU PRÓXIMO PASSO" : "ROTEIRO CONCLUÍDO"}
                    </span>
                    <h2>{next?.title ?? "Você fez o caminho acontecer."}</h2>
                    <p>
                      {next?.instructions ??
                        "Volte aos pontos difíceis, confira o programa oficial e revise seus erros antes da prova. Sessões concluídas medem seu estudo, não garantem uma nota."}
                    </p>
                    {next && (
                      <div>
                        <span>
                          <Clock3 size={14} /> {next.minutes} min estimados
                        </span>
                        <button
                          className="text-action"
                          onClick={() =>
                            document.getElementById(`prep-mission-${nextIndex}`)?.scrollIntoView({
                              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                                .matches
                                ? "instant"
                                : "smooth",
                              block: "center",
                            })
                          }
                        >
                          Ver sessão <ArrowRight size={15} />
                        </button>
                      </div>
                    )}
                  </section>
                  <div className="prep-section-heading">
                    <span className="prep-kicker">DO CONTEÚDO À CONFIANÇA</span>
                    <h2>Uma sessão de cada vez.</h2>
                    <p>Estude onde fizer sentido. Depois, marque o que você realizou.</p>
                  </div>
                  <div className="prep-missions">
                    {guide.missions.map((mission, index) => {
                      const done = Boolean(plan.completed[preparationMissionKey(index)]),
                        Icon = missionKinds[mission.kind].icon;
                      return (
                        <article
                          key={index}
                          id={`prep-mission-${index}`}
                          className={`prep-mission ${done ? "is-done" : ""} ${index === nextIndex ? "is-next" : ""}`}
                        >
                          <div className="prep-mission-number">
                            {done ? <Check size={18} /> : String(index + 1).padStart(2, "0")}
                          </div>
                          <div className="prep-mission-content">
                            <div className="prep-mission-meta">
                              <span>
                                <Icon size={13} /> {missionKinds[mission.kind].label}
                              </span>
                              <span>{mission.minutes} min</span>
                            </div>
                            <h3>{mission.title}</h3>
                            <small>{plan.topics[mission.topicIndex]?.title}</small>
                            <p>{mission.instructions}</p>
                            <div className="prep-deliverable">
                              <Flag size={15} />
                              <span>
                                <b>Ao terminar</b>
                                {mission.deliverable}
                              </span>
                            </div>
                            <div className="prep-mission-actions">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={done}
                                  onChange={(event) => toggleMission(index, event.target.checked)}
                                />
                                <span>
                                  {done ? "Sessão concluída" : "Marcar sessão como concluída"}
                                </span>
                              </label>
                              {(mission.kind === "watch" || mission.kind === "read") && (
                                <button className="text-action" onClick={() => setTab("library")}>
                                  Ver referências <ChevronRight size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
                <aside className="prep-strategy">
                  <span className="prep-kicker">SUA ESTRATÉGIA</span>
                  <h2>Constância com direção.</h2>
                  <p>{guide.approach}</p>
                  <div className="prep-strategy-rhythm">
                    <Clock3 size={17} />
                    <p>{guide.rhythm}</p>
                  </div>
                  <div className="prep-progress-label">
                    <span>Roteiro realizado</span>
                    <strong>{percentage}%</strong>
                  </div>
                  <div className="prep-progress-track">
                    <span style={{ width: `${percentage}%` }} />
                  </div>
                  <small>Progresso das sessões · não é uma estimativa da sua nota.</small>
                  <Link
                    to="/materias/$subjectId"
                    params={{ subjectId: plan.subjectId }}
                    className="duo-btn ghost"
                  >
                    <BookOpen size={16} /> Abrir meus cadernos
                  </Link>
                  <button className="text-action" onClick={() => setTab("library")}>
                    <Play size={15} /> Explorar vídeos e livros <ArrowRight size={14} />
                  </button>
                </aside>
              </div>
            )}
            {tab === "library" && (
              <section className="prep-library">
                <div className="prep-section-heading">
                  <span className="prep-kicker">BOAS REFERÊNCIAS, MENOS RUÍDO</span>
                  <h2>Sua pequena biblioteca.</h2>
                  <p>
                    A IA sugere o que procurar e como usar no seu estudo. Links de busca ajudam você
                    a escolher a aula ou a edição; não significam que um vídeo foi verificado ou um
                    livro é gratuito.
                  </p>
                </div>
                <div className="prep-resource-grid">
                  {guide.resources.map((resource, index) => (
                    <ResourceCard key={index} resource={resource} plan={plan} />
                  ))}
                </div>
                <p className="prep-library-note">
                  <BookOpen size={16} /> Para livros, confira autor, edição e disponibilidade em
                  bibliotecas ou lojas. Uma recomendação não dá acesso ao conteúdo do livro.
                </p>
              </section>
            )}
            {tab === "map" && (
              <section className="prep-program">
                <div className="prep-section-heading">
                  <span className="prep-kicker">ENXERGUE O TODO</span>
                  <h2>O mapa antes do caminho.</h2>
                  <p>{plan.overview}</p>
                </div>
                <div className="prep-program-grid">
                  {plan.topics.map((topic, index) => (
                    <article key={topic.id}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <h3>{topic.title}</h3>
                      <p>{topic.goal}</p>
                      <small>
                        <Target size={13} /> {topic.challenge}
                      </small>
                    </article>
                  ))}
                </div>
                <details className="prep-program-research">
                  <summary>
                    <Compass size={16} /> Contexto e fontes do desafio
                  </summary>
                  <p className="prep-caption">
                    {preparation.research.mode === "web"
                      ? "Confira a edição, o nível e o programa nas fontes consultadas."
                      : "Orientação pedagógica: o programa atual não foi confirmado. Confira o roteiro do professor ou o edital oficial."}
                  </p>
                  <div className="prep-report">
                    <ReactMarkdown
                      components={{ a: ({ children }) => <span>{children}</span>, img: () => null }}
                    >
                      {preparation.research.report}
                    </ReactMarkdown>
                  </div>
                  <div className="prep-research-sources">
                    {preparation.research.sources.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.title}
                        <ExternalLink size={13} />
                      </a>
                    ))}
                  </div>
                </details>
              </section>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <footer className="prep-dashboard-footer">
        <span>
          <Trophy size={16} /> Planeje aqui. Construa seu conhecimento todos os dias.
        </span>
        <button
          className="text-action"
          onClick={() => {
            if (
              confirm(
                `Excluir o plano “${preparation.exam}”? Seus cadernos e materiais serão mantidos.`,
              ) &&
              removePlan(plan.id)
            )
              void navigate({ to: "/preparar", search: {} });
          }}
        >
          <Trash2 size={14} /> Excluir plano
        </button>
      </footer>
    </div>
  );
}

function ResourceCard({
  resource,
  plan,
}: {
  resource: PreparationGuide["resources"][number];
  plan: LearningPlan;
}) {
  const link = preparationResourceLink(resource, plan.preparation!.research.sources),
    video = resource.kind === "video";
  return (
    <article className={`prep-resource is-${resource.kind}`}>
      <div className="prep-resource-top">
        <span className="prep-resource-symbol">
          {video ? <Play size={29} strokeWidth={1.3} /> : <BookOpen size={29} strokeWidth={1.3} />}
        </span>
        <span>
          {video ? "YOUTUBE" : "ESTANTE DE REFERÊNCIAS"}
          <small>{link.direct ? "Fonte encontrada na pesquisa" : "Sugestão para buscar"}</small>
        </span>
      </div>
      <small className="prep-resource-topic">{plan.topics[resource.topicIndex]?.title}</small>
      <h3>{resource.title}</h3>
      {resource.creator && <p className="prep-resource-creator">{resource.creator}</p>}
      <p>{resource.reason}</p>
      <a href={link.url} target="_blank" rel="noopener noreferrer" className="duo-btn ghost">
        {video
          ? link.direct
            ? "Abrir vídeo no YouTube"
            : "Buscar aula no YouTube"
          : link.direct
            ? "Consultar referência"
            : "Buscar livro"}
        <ExternalLink size={14} />
      </a>
    </article>
  );
}
