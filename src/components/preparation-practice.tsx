import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, ClipboardCheck, Layers3 } from "lucide-react";
import { useDailyAttempt } from "@/hooks/use-daily-attempt";
import { isCompleted, preparationActivities, type LearningPlan } from "@/lib/learning-model";
export function PreparationPractice({ plan }: { plan: LearningPlan }) {
  const quiz = useDailyAttempt("quiz"),
    cards = useDailyAttempt("flashcards");
  return (
    <section className="prep-practice">
      <div className="prep-section-heading">
        <span className="prep-kicker">DA LEITURA À PRÁTICA</span>
        <h2>Recupere. Resolva. Aprenda.</h2>
        <p>
          Relembre as ideias com flashcards e aplique o que estudou nas questões de cada tópico.
        </p>
      </div>
      <p className="prep-inline-note">
        <ClipboardCheck size={19} />
        <span>
          Hoje: <b>{cards.remaining} de 2 baralhos</b> e{" "}
          <b>{quiz.remaining} de 2 listas de questões</b> disponíveis. O limite é compartilhado com
          Aprender; trocar de plano não reinicia as tentativas. Uma geração que falha não consome a
          tentativa.
        </span>
      </p>
      <div className="prep-practice-topics">
        {plan.topics.map((topic, index) => (
          <article className="prep-practice-topic" key={topic.id}>
            <span className="prep-kicker">TÓPICO {String(index + 1).padStart(2, "0")}</span>
            <h3>{topic.title}</h3>
            <p>{topic.goal}</p>
            <div>
              {(["flashcards", "quiz"] as const).map((mode) => {
                const remaining = mode === "quiz" ? quiz.remaining : cards.remaining,
                  Icon = mode === "quiz" ? ClipboardCheck : Layers3,
                  destination = preparationActivities[mode];
                return (
                  <div className="prep-practice-action" key={mode}>
                    {remaining ? (
                      <Link
                        className="duo-btn ghost"
                        to={destination.to}
                        search={{
                          p: plan.id,
                          t: topic.id,
                          ...(plan.materialIds.length ? { m: plan.materialIds.join(",") } : {}),
                        }}
                      >
                        <Icon size={17} />
                        {destination.title}
                        <ArrowRight size={15} />
                      </Link>
                    ) : (
                      <button className="duo-btn ghost" disabled>
                        <Icon size={17} />
                        {destination.title} · limite de hoje
                      </button>
                    )}
                    {isCompleted(plan, topic.id, mode) && (
                      <small>
                        <Check size={13} />
                        Já praticado
                      </small>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
      <p className="prep-caption">
        Questões originais geradas pela IA a partir do seu plano; não são questões oficiais da
        banca. Revise as explicações e confira possíveis erros.
      </p>
    </section>
  );
}
