import React, { useState } from "react";
import {
  Zap,
  Flame,
  Scale,
  Globe,
  Compass,
  Flag,
  CheckCheck,
  Feather,
  Sparkles,
  Star,
  Play,
  Users,
  Share2,
} from "lucide-react";
import { GAMES_CATALOG, getGamesBySubject } from "@/lib/games/catalog";
import { getStoredHighScores, type GameDefinition, type GameSubject } from "@/lib/games/types";
import { GamePlayer } from "./game-player";
import "@/styles/games.css";

interface GameCatalogProps {
  onChallengeFriend?: (game: GameDefinition) => void;
}

export function GameCatalog({ onChallengeFriend }: GameCatalogProps) {
  const [selectedSubject, setSelectedSubject] = useState<string>("todos");
  const [activeGame, setActiveGame] = useState<GameDefinition | null>(null);
  const [copiedChallenge, setCopiedChallenge] = useState<string | null>(null);

  const highScores = getStoredHighScores();
  const games = getGamesBySubject(selectedSubject);

  const renderGameIcon = (name: string, size = 22) => {
    switch (name) {
      case "Zap":
        return <Zap size={size} />;
      case "Flame":
        return <Flame size={size} />;
      case "Scale":
        return <Scale size={size} />;
      case "Globe":
        return <Globe size={size} />;
      case "Compass":
        return <Compass size={size} />;
      case "Flag":
        return <Flag size={size} />;
      case "CheckCheck":
        return <CheckCheck size={size} />;
      case "Feather":
        return <Feather size={size} />;
      default:
        return <Sparkles size={size} />;
    }
  };

  const getSubjectLabel = (subject: GameSubject) => {
    switch (subject) {
      case "matematica":
        return "Matemática";
      case "geografia":
        return "Geografia";
      case "portugues":
        return "Português";
      default:
        return subject;
    }
  };

  const handleChallenge = (game: GameDefinition) => {
    if (onChallengeFriend) {
      onChallengeFriend(game);
      return;
    }

    if (typeof window !== "undefined" && navigator.clipboard) {
      const challengeUrl = `${window.location.origin}/sessoes?tab=games&game=${game.id}`;
      navigator.clipboard.writeText(
        `Desafio GStudy no jogo "${game.title}"! Consegue bater meu recorde? Acesse: ${challengeUrl}`,
      );
      setCopiedChallenge(game.id);
      setTimeout(() => setCopiedChallenge(null), 3000);
    }
  };

  return (
    <div className="games-catalog-container">
      {/* Subject Filter Bar */}
      <div className="games-filter-bar" role="tablist" aria-label="Filtrar jogos por matéria">
        <button
          type="button"
          role="tab"
          aria-selected={selectedSubject === "todos"}
          className={`games-filter-chip ${selectedSubject === "todos" ? "active" : ""}`}
          onClick={() => setSelectedSubject("todos")}
        >
          <Sparkles size={15} />
          <span>Todas as matérias</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={selectedSubject === "matematica"}
          className={`games-filter-chip ${selectedSubject === "matematica" ? "active" : ""}`}
          onClick={() => setSelectedSubject("matematica")}
        >
          <Scale size={15} />
          <span>Matemática</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={selectedSubject === "geografia"}
          className={`games-filter-chip ${selectedSubject === "geografia" ? "active" : ""}`}
          onClick={() => setSelectedSubject("geografia")}
        >
          <Globe size={15} />
          <span>Geografia</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={selectedSubject === "portugues"}
          className={`games-filter-chip ${selectedSubject === "portugues" ? "active" : ""}`}
          onClick={() => setSelectedSubject("portugues")}
        >
          <Feather size={15} />
          <span>Português</span>
        </button>
      </div>

      {/* Games Grid */}
      <div className="games-grid" role="region" aria-label="Catálogo de jogos">
        {games.map((game) => {
          // Find best score across difficulties
          const recordKey = ["medio", "facil", "dificil"]
            .map((diff) => `${game.id}_${diff}`)
            .find((k) => highScores[k]);

          const record = recordKey ? highScores[recordKey] : null;

          return (
            <article key={game.id} className="game-card">
              <div>
                <div className="game-card-header">
                  <div className="game-card-icon-wrap">{renderGameIcon(game.iconName)}</div>
                  <span className="game-card-subject-badge">{getSubjectLabel(game.subject)}</span>
                </div>

                <h3 className="game-card-title">{game.title}</h3>
                <p className="game-card-desc">{game.description}</p>
              </div>

              <div>
                <div className="game-card-meta">
                  <div
                    className="game-card-stars"
                    aria-label={`Recorde: ${record?.stars ?? 0} estrelas`}
                  >
                    {[1, 2, 3].map((starIdx) => (
                      <Star
                        key={starIdx}
                        size={15}
                        className={(record?.stars ?? 0) >= starIdx ? "star-filled" : ""}
                      />
                    ))}
                  </div>
                  <span>
                    {record
                      ? `Recorde: ${record.bestScore} pts`
                      : `Duração: ~${game.estimatedMinutes} min`}
                  </span>
                </div>

                <div className="game-card-actions">
                  <button
                    type="button"
                    className="game-card-btn-play"
                    onClick={() => setActiveGame(game)}
                    aria-label={`Jogar solo: ${game.title}`}
                  >
                    <Play size={15} fill="currentColor" />
                    <span>Jogar solo</span>
                  </button>
                  <button
                    type="button"
                    className="game-card-btn-challenge"
                    onClick={() => handleChallenge(game)}
                    title="Desafiar amigo"
                    aria-label={`Desafiar amigo em ${game.title}`}
                  >
                    <Users size={14} />
                    <span>{copiedChallenge === game.id ? "Link copiado!" : "Desafiar"}</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* ACTIVE GAME PLAYER MODAL */}
      {activeGame && (
        <GamePlayer
          game={activeGame}
          onClose={() => setActiveGame(null)}
          onRestart={() => setActiveGame(null)}
        />
      )}
    </div>
  );
}
