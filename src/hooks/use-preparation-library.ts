import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useLearning } from "@/components/learning-provider";
import { curatePreparationLibrary } from "@/lib/preparation-library.functions";
import type { LearningPlan } from "@/lib/learning-model";
import type { PreparationLibrary } from "@/lib/preparation-library-model";

export function usePreparationLibrary(plan: LearningPlan, active: boolean) {
  const curate = useServerFn(curatePreparationLibrary);
  const { savePreparationLibrary } = useLearning();
  const [draft, setDraft] = useState<PreparationLibrary | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requested = useRef(false),
    lock = useRef(false);
  const guide = plan.preparation?.guide;
  const refresh = async () => {
    if (lock.current || !plan.preparation || !guide) return;
    lock.current = true;
    requested.current = true;
    setBusy(true);
    setError("");
    try {
      const library =
        draft ??
        (await curate({
          data: {
            kind: plan.preparation.kind,
            exam: plan.preparation.exam,
            edition: plan.preparation.edition,
            schoolYear: plan.preparation.schoolYear,
            subject: plan.subject,
            focus: plan.preparation.focus,
            topics: plan.topics.map(({ title, goal }) => ({ title, goal })),
            recommendations: guide.resources.map(({ title, creator, kind, topicIndex }) => ({
              title,
              creator,
              kind,
              topicIndex,
            })),
          },
        }));
      setDraft(library);
      if (!savePreparationLibrary(plan.id, library))
        throw new Error(
          "As indicações estão prontas, mas não foi possível salvar. Tente salvar novamente; não é preciso pesquisar outra vez.",
        );
      setDraft(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível atualizar suas indicações agora.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    if (active && guide && !guide.library && !requested.current) void refresh();
  }, [active, guide]);
  return { library: draft ?? guide?.library, busy, error, refresh, unsaved: Boolean(draft) };
}
