import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SessionsView, type SessionTab } from "@/components/sessions-view";
import { isSocialFeatureEnabled } from "@/lib/social-model";

export const Route = createFileRoute("/sessoes")({
  validateSearch: (search: Record<string, unknown>): { tab?: SessionTab } => {
    const tab = search.tab as SessionTab | undefined;
    return ["rooms", "groups", "games"].includes(String(tab)) ? { tab } : {};
  },
  head: () => ({
    meta: [
      { title: "GStudy · Sessões Coletivas" },
      { name: "description", content: "Salas de estudo ao vivo, grupos e jogos coletivos." },
    ],
  }),
  component: SessoesRoute,
});

function SessoesRoute() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const enabled = isSocialFeatureEnabled();

  useEffect(() => {
    if (!enabled) {
      void navigate({ to: "/" });
    }
  }, [enabled, navigate]);

  if (!enabled) {
    return null;
  }

  return <SessionsView initialTab={search.tab ?? "rooms"} />;
}
