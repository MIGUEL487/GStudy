import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useLearning } from "@/components/learning-provider";
import {
  curatePreparationLibrary,
  getPreparationYouTubeStatus,
} from "@/lib/preparation-library.functions";
import type { LearningPlan } from "@/lib/learning-model";
import {
  youtubeMissingNotice,
  portugueseBookLanguage,
  type PreparationLibrary,
} from "@/lib/preparation-library-model";

export function usePreparationLibrary(plan: LearningPlan, active: boolean) {
  const curate = useServerFn(curatePreparationLibrary);
  const checkStatus = useServerFn(getPreparationYouTubeStatus);
  const [configurationMissing, setConfigurationMissing] = useState(false);
  const { savePreparationLibrary } = useLearning();
  const [draft, setDraft] = useState<PreparationLibrary | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requested = useRef(false),
    lock = useRef(false);
  const guide = plan.preparation?.guide;
  const latestLibrary = useRef(guide?.library);
  latestLibrary.current = guide?.library;
  const refresh = async (scope: "all" | "books" = "all") => {
    if (lock.current || !plan.preparation || !guide) return;
    lock.current = true;
    requested.current = true;
    setBusy(true);
    setError("");
    setConfigurationMissing(false);
    try {
      const result =
        draft ??
        (await curate({
          data: {
            scope,
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
      const previous = latestLibrary.current;
      const library =
        scope === "books" && previous && !draft
          ? {
              ...previous,
              books: result.books,
              bookNotice: result.bookNotice,
              bookSearchVersion: result.bookSearchVersion,
              bookSearchStatus: result.bookSearchStatus,
            }
          : result;
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
    if (!active || !guide || requested.current) return;
    if (!guide.library) {
      void refresh();
      return;
    }
    // Refresh libraries saved before the Portuguese-only policy once, without paying
    // for another YouTube search or replacing the student's selected videos.
    if (
      guide.library.bookSearchVersion !== 5 &&
      (guide.library.videos.length || guide.library.mode !== "unavailable")
    ) {
      void refresh("books");
      return;
    }
    if (guide.library.videos.length || guide.library.mode !== "unavailable") return;
    requested.current = true;
    // A negative result may predate the deployment's YouTube configuration.
    // Check presence first so missing configuration does not spend another AI search.
    setBusy(true);
    void (async () => {
      try {
        const status = await checkStatus();
        if (status.youtubeConfigured) await refresh();
        else setConfigurationMissing(true);
      } catch {
        setError(
          "Não foi possível verificar a busca de aulas agora. Tente atualizar as indicações.",
        );
      } finally {
        setBusy(false);
      }
    })();
  }, [active, guide]);
  const saved = draft ?? guide?.library;
  const library = saved
    ? {
        ...saved,
        books: saved.books.filter((book) => portugueseBookLanguage(book.language)),
        ...(configurationMissing ? { videoNotice: youtubeMissingNotice } : {}),
      }
    : saved;
  return {
    library,
    busy,
    error,
    refresh: () => refresh(),
    refreshBooks: () => refresh("books"),
    unsaved: Boolean(draft),
  };
}
