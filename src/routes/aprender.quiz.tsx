import { createFileRoute } from "@tanstack/react-router";
import { learningSearch } from "@/lib/learning-model";
import { QuizLesson } from "@/components/quiz-lesson";

export const Route = createFileRoute("/aprender/quiz")({
  validateSearch: learningSearch,
  head: () => ({
    meta: [
      { title: "GStudy · Quiz" },
      { name: "description", content: "Perguntas geradas a partir do seu material de estudo." },
      { property: "og:title", content: "GStudy · Quiz" },
      { property: "og:description", content: "Teste o que aprendeu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuizPage,
});
function QuizPage() {
  return <QuizLesson search={Route.useSearch()} />;
}
