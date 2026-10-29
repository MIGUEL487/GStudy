import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Gamepad2 } from "lucide-react";
import { GameCatalog } from "@/components/games/game-catalog";
import type { GameDifficulty } from "@/lib/games/types";

export const Route = createFileRoute("/jogos/")({
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
  component: JogosIndexRoute,
});

function JogosIndexRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (!search.game && !search.challenge) return;
    void navigate({
      to: "/jogos/$gameId",
      params: { gameId: search.game ?? "desafio" },
      search: {
        seed: search.seed,
        difficulty: search.difficulty,
        challenge: search.challenge,
      },
      replace: true,
    });
  }, [navigate, search]);
  if (search.game || search.challenge) return null;
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
      <GameCatalog />
    </div>
  );
}
