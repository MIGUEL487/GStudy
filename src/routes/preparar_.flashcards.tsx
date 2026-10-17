import { createFileRoute } from "@tanstack/react-router";
import { learningSearch } from "@/lib/learning-model";
import { FlashcardsLesson } from "@/components/flashcards-lesson";
export const Route = createFileRoute("/preparar_/flashcards")({
  validateSearch: learningSearch,
  head: () => ({ meta: [{ title: "GStudy · Flashcards da sua prova" }] }),
  component: () => <FlashcardsLesson search={Route.useSearch()} />,
});
