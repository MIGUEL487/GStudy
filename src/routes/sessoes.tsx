import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SessionsView, type SessionTab } from "@/components/sessions-view";
import { isSocialFeatureEnabled } from "@/lib/social-model";
import type { GameDifficulty } from "@/lib/games/types";

export const Route = createFileRoute("/sessoes")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    tab?: SessionTab | undefined;
    game?: string | undefined;
    seed?: string | undefined;
    difficulty?: GameDifficulty | undefined;
    challenge?: string | undefined;
  } => {
    const tab = search.tab as SessionTab | undefined;
    return {
      ...(["rooms", "groups", "games"].includes(String(tab)) ? { tab } : {}),
      ...(typeof search.game === "string" && /^[a-z][a-z0-9-]{2,80}$/.test(search.game)
        ? { game: search.game }
        : {}),
      ...(typeof search.seed === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(search.seed)
        ? { seed: search.seed }
        : {}),
      ...(["facil", "medio", "dificil"].includes(String(search.difficulty))
        ? { difficulty: search.difficulty as GameDifficulty }
        : {}),
      ...(typeof search.challenge === "string" && /^[0-9a-f-]{36}$/i.test(search.challenge)
        ? { challenge: search.challenge }
        : {}),
    };
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

  return (
    <SessionsView
      initialTab={search.game || search.challenge ? "games" : (search.tab ?? "rooms")}
      initialGame={{
        gameId: search.game,
        seed: search.seed,
        difficulty: search.difficulty,
        challengeId: search.challenge,
      }}
    />
  );
}
