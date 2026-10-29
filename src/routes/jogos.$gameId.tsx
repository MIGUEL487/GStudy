import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { GamePlayer } from "@/components/games/game-player";
import { getGameById } from "@/lib/games/catalog";
import { readGameChallenge } from "@/lib/games/rpc";
import { readSharedGame } from "@/lib/games.functions";
import type { GameDefinition, GameDifficulty } from "@/lib/games/types";

export const Route = createFileRoute("/jogos/$gameId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    seed?: string | undefined;
    difficulty?: GameDifficulty | undefined;
    challenge?: string | undefined;
  } => ({
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
      { title: "GStudy · Jogar" },
      { name: "description", content: "Treine seus conhecimentos em um jogo do GStudy." },
    ],
  }),
  component: GameRoute,
});

type ResolvedGame = {
  game: GameDefinition;
  seed?: string | undefined;
  difficulty?: GameDifficulty | undefined;
  challengeId?: string | undefined;
};

function GameRoute() {
  const { gameId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const readShared = useServerFn(readSharedGame);
  const [resolved, setResolved] = useState<ResolvedGame | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setResolved(null);
    setError("");
    void (async () => {
      try {
        let id = gameId;
        let seed = search.seed;
        let difficulty = search.difficulty;
        let challengeId: string | undefined;
        if (search.challenge) {
          const { challenge } = await readGameChallenge(search.challenge);
          if (Date.parse(challenge.expires_at) <= Date.now())
            throw new Error("Este desafio expirou. Crie outro para jogar com seu amigo.");
          id = challenge.game_id;
          seed = challenge.seed;
          difficulty = challenge.difficulty;
          challengeId = challenge.id;
        }
        let game = getGameById(id);
        if (!game && /^ai-[a-f0-9]{64}$/.test(id)) game = (await readShared({ data: { id } })).game;
        if (!game) throw new Error("Este jogo não está disponível.");
        if (active) setResolved({ game, seed, difficulty, challengeId });
      } catch (cause) {
        if (active)
          setError(cause instanceof Error ? cause.message : "Não foi possível abrir este jogo.");
      }
    })();
    return () => {
      active = false;
    };
  }, [gameId, readShared, search.challenge, search.difficulty, search.seed]);

  if (error)
    return (
      <section className="game-page-state" role="alert">
        <h1>Não foi possível abrir o jogo</h1>
        <p>{error}</p>
        <Link to="/jogos" className="game-card-btn-play">
          Voltar ao catálogo
        </Link>
      </section>
    );
  if (!resolved)
    return (
      <p className="game-page-state" role="status">
        Preparando jogo…
      </p>
    );
  return (
    <GamePlayer
      standalone
      game={resolved.game}
      seed={resolved.seed}
      difficulty={resolved.difficulty}
      challengeId={resolved.challengeId}
      onClose={() => void navigate({ to: "/jogos" })}
      onRestart={() => void navigate({ to: "/jogos" })}
    />
  );
}
