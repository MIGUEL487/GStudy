import { createFileRoute } from "@tanstack/react-router";
import { Gamepad2 } from "lucide-react";
import { GameCatalog } from "@/components/games/game-catalog";
import type { GameDifficulty } from "@/lib/games/types";

export const Route = createFileRoute("/jogos")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    game?: string | undefined;
    seed?: string | undefined;
    difficulty?: GameDifficulty | undefined;
    challenge?: string | undefined;
  } => ({
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
  }),
  head: () => ({
    meta: [
      { title: "GStudy · Jogos" },
      {
        name: "description",
        content: "Jogos rápidos por matéria, desafios entre amigos e recordes de estudo.",
      },
    ],
  }),
  component: JogosRoute,
});

function JogosRoute() {
  const search = Route.useSearch();
  return (
    <div className="games-page">
      <header className="games-page-heading">
        <span className="games-page-icon" aria-hidden="true">
          <Gamepad2 size={24} />
        </span>
        <div>
          <h1>Jogos</h1>
          <p>Escolha uma matéria, treine em poucos minutos e tente superar seu recorde.</p>
        </div>
      </header>
      <GameCatalog
        initialLaunch={{
          gameId: search.game,
          seed: search.seed,
          difficulty: search.difficulty,
          challengeId: search.challenge,
        }}
      />
    </div>
  );
}
