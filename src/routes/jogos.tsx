import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/jogos")({
  head: () => ({
    meta: [
      { title: "GStudy · Jogos" },
      {
        name: "description",
        content: "Jogos rápidos por matéria, desafios entre amigos e recordes de estudo.",
      },
    ],
  }),
  component: JogosLayout,
});

function JogosLayout() {
  return <Outlet />;
}
