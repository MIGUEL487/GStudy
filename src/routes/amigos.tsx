import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/amigos")({
  beforeLoad: () => {
    throw redirect({ to: "/sessoes", search: { tab: "groups" }, replace: true });
  },
});
