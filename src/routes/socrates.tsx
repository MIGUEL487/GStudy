import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/components/auth-gate";
import { SocratesChat } from "@/components/socrates-chat";
export const Route = createFileRoute("/socrates")({
  head: () => ({
    meta: [
      { title: "GStudy · Sócrates" },
      {
        name: "description",
        content:
          "Entenda o porquê, explique com suas palavras e construa o conhecimento com Sócrates.",
      },
    ],
  }),
  component: SocratesPage,
});
function SocratesPage() {
  const { user } = useAuth();
  return <SocratesChat key={user.id} userId={user.id} />;
}
