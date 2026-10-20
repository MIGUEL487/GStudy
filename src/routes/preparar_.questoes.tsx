import { createFileRoute } from "@tanstack/react-router";
import { learningSearch } from "@/lib/learning-model";
import { QuizLesson } from "@/components/quiz-lesson";

function PrepararQuestoesPage() {
  const search = Route.useSearch();
  return <QuizLesson search={search} />;
}

export const Route = createFileRoute("/preparar_/questoes")({
  validateSearch: learningSearch,
  head: () => ({ meta: [{ title: "GStudy · Questões da sua prova" }] }),
  component: PrepararQuestoesPage,
});
