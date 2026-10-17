import { createFileRoute } from "@tanstack/react-router";
import { learningSearch } from "@/lib/learning-model";
import { FlashcardsLesson } from "@/components/flashcards-lesson";

export const Route = createFileRoute("/aprender/flashcards")({
  validateSearch: learningSearch,
  head: () => ({
    meta: [
      { title: "GStudy · Flashcards" },
      { name: "description", content: "Cartas de memorização criadas do seu material." },
      { property: "og:title", content: "GStudy · Flashcards" },
      { property: "og:description", content: "Memorize virando cartas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CardsPage,
});
function CardsPage() {
  return <FlashcardsLesson search={Route.useSearch()} />;
}
