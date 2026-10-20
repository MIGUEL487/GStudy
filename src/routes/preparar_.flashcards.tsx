import { createFileRoute } from "@tanstack/react-router";
import { learningSearch } from "@/lib/learning-model";
import { FlashcardsLesson } from "@/components/flashcards-lesson";

function PrepararFlashcardsPage() {
  const search = Route.useSearch();
  return <FlashcardsLesson search={search} />;
}

export const Route = createFileRoute("/preparar_/flashcards")({
  validateSearch: learningSearch,
  head: () => ({ meta: [{ title: "GStudy · Flashcards da sua prova" }] }),
  component: PrepararFlashcardsPage,
});
