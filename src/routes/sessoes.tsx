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
    legacyGames?: true | undefined;
    game?: string | undefined;
    seed?: string | undefined;
    difficulty?: GameDifficulty | undefined;
    challenge?: string | undefined;
  } => {
    const tab = search.tab;
    return {
      ...(["rooms", "groups"].includes(String(tab)) ? { tab: tab as SessionTab } : {}),
      ...(tab === "games" ? { legacyGames: true as const } : {}),
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
    } else if (search.legacyGames || search.game || search.challenge) {
      void navigate({
        to: "/jogos",
        search: {
          game: search.game,
          seed: search.seed,
          difficulty: search.difficulty,
          challenge: search.challenge,
        },
        replace: true,
      });
    }
  }, [enabled, navigate, search]);

  if (!enabled || search.legacyGames || search.game || search.challenge) {
    return null;
  }

  return <SessionsView initialTab={search.tab ?? "rooms"} />;
}
