import { lazy, Suspense, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Gamepad2, Play, Sparkles, Trophy, Users } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useHearts } from "@/components/hearts-provider";
import { GAMES_CATALOG, getGameById } from "@/lib/games/catalog";
import {
  getStoredHighScores,
  cacheGameHighScores,
  type GameDefinition,
  type GameDifficulty,
  type GameLaunch,
} from "@/lib/games/types";
import {
  createGameChallenge,
  gameLeaderboard,
  gamePersonalRecords,
  readGameChallenge,
} from "@/lib/games/rpc";
import { generateGame, readSharedGame } from "@/lib/games.functions";
import { listFriends, type Friendship } from "@/lib/social-model";
import { fetchCurrentStudentProfile } from "@/lib/student-profile";
import { normalizeAnswer } from "@/lib/games/engine";
import "@/styles/games.css";
const GamePlayer = lazy(() =>
  import("./game-player").then((module) => ({ default: module.GamePlayer })),
);
const subjects = {
  matematica: "Matemática",
  geografia: "Geografia",
  portugues: "Português",
  biologia: "Biologia",
  historia: "História",
  fisica: "Física",
  ingles: "Inglês",
  outros: "Outras matérias",
};
const mechanics = {
  "multiple-choice": "Alternativas",
  "time-survival": "Sobrevivência",
  "memory-pairs": "Pares e memória",
  "sequence-order": "Ordenar sequência",
  "word-hangman": "Forca",
  "typing-fast": "Digitação rápida",
  "drag-classify": "Classificar",
} as const;
export function GameCatalog({
  onChallengeFriend,
  initialLaunch,
}: {
  onChallengeFriend?: (game: GameDefinition) => void;
  initialLaunch?: GameLaunch | undefined;
}) {
  const userId = useHearts()?.userId;
  const [cloudRecords, setCloudRecords] = useState<{
    userId: string;
    records: Awaited<ReturnType<typeof gamePersonalRecords>>;
  } | null>(null);
  const [recordsError, setRecordsError] = useState("");
  const [subject, setSubject] = useState("todos"),
    [favorite, setFavorite] = useState("");
  const [active, setActive] = useState<{
    game: GameDefinition;
    seed?: string | undefined;
    difficulty?: GameDifficulty | undefined;
    challengeId?: string | undefined;
  } | null>(null);
  const [custom, setCustom] = useState<GameDefinition[]>([]),
    [shared, setShared] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false);
  const [topic, setTopic] = useState(""),
    [customSubject, setCustomSubject] = useState("Biologia"),
    [type, setType] = useState<keyof typeof mechanics>("multiple-choice");
  const [difficulty, setDifficulty] = useState<GameDifficulty>("medio");
  const [challengeGame, setChallengeGame] = useState<GameDefinition | null>(null),
    [friends, setFriends] = useState<Friendship[]>([]),
    [friend, setFriend] = useState(""),
    [challengeSeed, setChallengeSeed] = useState(""),
    [challengeLink, setChallengeLink] = useState("");
  const [ranking, setRanking] = useState<GameDefinition | null>(null),
    [period, setPeriod] = useState("week");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof gameLeaderboard>>>([]),
    [rankingError, setRankingError] = useState(""),
    [rankingLoading, setRankingLoading] = useState(false);
  const generate = useServerFn(generateGame),
    readShared = useServerFn(readSharedGame);
  const launchKey = JSON.stringify(initialLaunch ?? null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const refresh = () =>
      void gamePersonalRecords()
        .then((records) => {
          if (!alive) return;
          setCloudRecords({ userId, records });
          setRecordsError(
            cacheGameHighScores(userId, records)
              ? ""
              : "Seus recordes foram carregados, mas não foi possível guardar a cópia neste navegador.",
          );
        })
        .catch((cause) => {
          if (alive)
            setRecordsError(
              cause instanceof Error ? cause.message : "Não foi possível carregar seus recordes.",
            );
        });
    refresh();
    window.addEventListener("gstudy-reward-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.removeEventListener("gstudy-reward-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void fetchCurrentStudentProfile(userId).then((profile) => {
      if (alive) setFavorite(normalizeAnswer(profile?.favoriteSubject ?? ""));
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  useEffect(() => {
    if (!initialLaunch?.gameId && !initialLaunch?.challengeId) return;
    let alive = true;
    void (async () => {
      try {
        let launch = initialLaunch;
        if (launch.challengeId) {
          const { challenge } = await readGameChallenge(launch.challengeId);
          if (Date.parse(challenge.expires_at) <= Date.now())
            throw new Error("Este desafio expirou. Crie outro para jogar com seu amigo.");
          launch = {
            gameId: challenge.game_id,
            seed: challenge.seed,
            difficulty: challenge.difficulty,
            challengeId: challenge.id,
          };
        }
        let game = getGameById(launch.gameId ?? "");
        if (!game && launch.gameId && /^ai-[a-f0-9]{64}$/.test(launch.gameId))
          game = (await readShared({ data: { id: launch.gameId } })).game;
        if (!game) throw new Error("Este jogo não está disponível. Escolha outro no catálogo.");
        if (alive)
          setActive({
            game,
            seed: launch.seed,
            difficulty: launch.difficulty,
            challengeId: launch.challengeId,
          });
      } catch (cause) {
        if (alive)
          setError(cause instanceof Error ? cause.message : "Não foi possível abrir o desafio.");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchKey]);
  useEffect(() => {
    if (!ranking) return;
    let alive = true;
    setRankingError("");
    setRows([]);
    setRankingLoading(true);
    void gameLeaderboard(ranking.id, difficulty, period)
      .then((value) => {
        if (alive) setRows(value);
      })
      .catch((cause) => {
        if (alive)
          setRankingError(
            cause instanceof Error ? cause.message : "Não foi possível carregar os recordes.",
          );
      })
      .finally(() => {
        if (alive) setRankingLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ranking, difficulty, period]);
  const scores = { ...(cloudRecords?.userId === userId ? cloudRecords?.records : {}) };
  for (const [key, record] of Object.entries(getStoredHighScores(userId)))
    if (!scores[key] || record.bestScore > scores[key]!.bestScore) scores[key] = record;
  const games = [...GAMES_CATALOG, ...custom].filter(
    (game) =>
      subject === "todos" ||
      (subject === "favorite"
        ? normalizeAnswer(subjects[game.subject]) === favorite
        : game.subject === subject),
  );
  const askChallenge = async (game: GameDefinition) => {
    if (game.fixedDifficulty) setDifficulty(game.fixedDifficulty);
    if (onChallengeFriend) {
      onChallengeFriend(game);
      return;
    }
    setError("");
    setChallengeLink("");
    setFriend("");
    setChallengeSeed(crypto.randomUUID());
    setChallengeGame(game);
    setFriends([]);
    if (userId) setFriends(await listFriends(userId));
  };
  const sendChallenge = async () => {
    if (!challengeGame || !friend || busy) return;
    setBusy(true);
    setError("");
    try {
      const challenge = await createGameChallenge(
        friend,
        challengeGame.id,
        difficulty,
        challengeSeed,
      );
      setChallengeLink(`${window.location.origin}/sessoes?tab=games&challenge=${challenge.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar o desafio.");
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    if (busy || !topic.trim() || !customSubject.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await generate({ data: { topic, subject: customSubject, type, difficulty } });
      setShared((current) => ({ ...current, [result.game.id]: result.cache !== "unavailable" }));
      setCustom((current) => [
        ...current.filter((game) => game.id !== result.game.id),
        result.game,
      ]);
      setCreating(false);
      setActive({ game: result.game, difficulty });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o jogo agora.");
    } finally {
      setBusy(false);
    }
  };
  const difficultyPicker = (
    <label>
      Dificuldade
      <select
        value={difficulty}
        disabled={Boolean(challengeGame?.fixedDifficulty) || busy}
        onChange={(event) => setDifficulty(event.target.value as GameDifficulty)}
      >
        <option value="facil">Fácil</option>
        <option value="medio">Médio</option>
        <option value="dificil">Difícil</option>
      </select>
    </label>
  );
  return (
    <div className="games-catalog-container">
      {recordsError && (
        <p className="form-error" role="status">
          {recordsError}
        </p>
      )}
      <div className="games-catalog-heading">
        <p>Escolha um desafio curto ou crie um jogo para seu tema de estudo.</p>
        <button
          className="game-card-btn-play"
          onClick={() => {
            setCreating(true);
            setError("");
          }}
        >
          <Sparkles size={16} /> Criar jogo com IA
        </button>
      </div>
      <div className="games-filter-bar" role="tablist" aria-label="Filtrar jogos por matéria">
        <button
          role="tab"
          aria-selected={subject === "todos"}
          className={`games-filter-chip ${subject === "todos" ? "active" : ""}`}
          onClick={() => setSubject("todos")}
        >
          Todas as matérias
        </button>
        {favorite &&
          Object.values(subjects).some((value) => normalizeAnswer(value) === favorite) && (
            <button
              role="tab"
              aria-selected={subject === "favorite"}
              className="games-filter-chip"
              onClick={() => setSubject("favorite")}
            >
              Para você
            </button>
          )}
        {Object.entries(subjects).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={subject === key}
            className={`games-filter-chip ${subject === key ? "active" : ""}`}
            onClick={() => setSubject(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && !creating && !challengeGame && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="games-grid" role="region" aria-label="Catálogo de jogos">
        {games.map((game) => {
          const best = Object.values(scores)
            .filter((score) => score.gameId === game.id)
            .sort((a, b) => b.bestScore - a.bestScore)[0];
          return (
            <article key={game.id} className="game-card">
              <div>
                <div className="game-card-header">
                  <Gamepad2 size={22} />
                  <span className="game-card-subject-badge">{subjects[game.subject]}</span>
                </div>
                <h3 className="game-card-title">{game.title}</h3>
                <p className="game-card-desc">{game.description}</p>
              </div>
              <div>
                <p className="game-card-meta">
                  {best
                    ? `Recorde pessoal: ${best.bestScore} pts`
                    : `Cerca de ${game.estimatedMinutes} minutos`}
                </p>
                <div className="game-card-actions">
                  <button
                    className="game-card-btn-play"
                    aria-label={`Jogar solo: ${game.title}`}
                    onClick={() => setActive({ game })}
                  >
                    <Play size={16} /> Jogar solo
                  </button>
                  <button
                    className="game-card-btn-challenge"
                    disabled={game.source === "ai" && shared[game.id] === false}
                    aria-label={`Desafiar amigo em ${game.title}`}
                    onClick={() => void askChallenge(game)}
                  >
                    <Users size={16} /> Desafiar
                  </button>
                  <button
                    className="game-card-btn-challenge"
                    aria-label={`Ver recordes de ${game.title}`}
                    onClick={() => setRanking(game)}
                  >
                    <Trophy size={16} /> Recordes
                  </button>
                </div>
                {game.source === "ai" && shared[game.id] === false && (
                  <small>
                    Você pode jogar sozinho. Este jogo ainda não pôde ser compartilhado.
                  </small>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {active && (
        <Suspense fallback={<p role="status">Preparando jogo…</p>}>
          <GamePlayer
            game={active.game}
            seed={active.seed}
            difficulty={active.difficulty}
            challengeId={active.challengeId}
            onClose={() => setActive(null)}
            onRestart={() => setActive(null)}
          />
        </Suspense>
      )}
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!busy) setCreating(open);
        }}
      >
        <DialogContent>
          <DialogTitle>Criar jogo para um tema</DialogTitle>
          <form
            className="game-generator"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <label>
              Matéria
              <input
                value={customSubject}
                maxLength={80}
                disabled={busy}
                onChange={(event) => setCustomSubject(event.target.value)}
              />
            </label>
            <label>
              Tema
              <input
                value={topic}
                maxLength={160}
                minLength={3}
                disabled={busy}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Ex.: cadeias alimentares"
              />
            </label>
            <label>
              Como jogar
              <select
                value={type}
                disabled={busy}
                onChange={(event) => setType(event.target.value as keyof typeof mechanics)}
              >
                {Object.entries(mechanics).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {difficultyPicker}
            <p>Conteúdo gerado por IA. Confira explicações e fontes de estudo ao revisar.</p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="game-card-btn-play" disabled={busy || topic.trim().length < 3}>
              {busy ? "Preparando jogo…" : "Criar jogo"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(challengeGame)}
        onOpenChange={(open) => {
          if (!open) setChallengeGame(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Desafiar um amigo</DialogTitle>
          <p>{challengeGame?.title}</p>
          {difficultyPicker}
          <label>
            Amigo
            <select
              value={friend}
              disabled={busy || Boolean(challengeLink)}
              onChange={(event) => setFriend(event.target.value)}
            >
              <option value="">Escolha um amigo</option>
              {friends.map((item) => (
                <option key={item.id} value={item.userId === userId ? item.friendId : item.userId}>
                  {item.profile?.displayName ?? item.profile?.username ?? "Amigo"}
                </option>
              ))}
            </select>
          </label>
          {!friends.length && <p>Adicione um amigo para enviar um desafio.</p>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {challengeLink ? (
            <div>
              <p>Convite enviado. Vocês terão a mesma sequência e dificuldade.</p>
              <a className="duo-btn" href={challengeLink}>
                Jogar este desafio
              </a>
            </div>
          ) : (
            <button
              className="game-card-btn-play"
              disabled={busy || !friend}
              onClick={() => void sendChallenge()}
            >
              {busy ? "Enviando…" : "Enviar desafio"}
            </button>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(ranking)}
        onOpenChange={(open) => {
          if (!open) setRanking(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Recordes · {ranking?.title}</DialogTitle>
          {difficultyPicker}
          <label>
            Período
            <select value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="week">Esta semana</option>
              <option value="total">Todo o período</option>
            </select>
          </label>
          {rankingLoading && <p role="status">Carregando recordes…</p>}
          {rankingError && <p role="alert">{rankingError}</p>}
          {!rankingLoading && !rankingError && !rows.length && (
            <p>Nenhuma partida registrada neste período.</p>
          )}
          <ol className="game-leaderboard">
            {rows.map((row) => (
              <li key={row.user_id} className={row.user_id === userId ? "is-you" : ""}>
                <span>
                  {row.rank_position}. {row.display_name}
                  {row.user_id === userId ? " (você)" : ""}
                </span>
                <strong>{row.score} pts</strong>
              </li>
            ))}
          </ol>
          <p>Você e seus amigos que escolheram aparecer nos rankings.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
