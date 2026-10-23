import React, { useEffect, useRef, useState } from "react";
import {
  X,
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
  Trophy,
  RotateCcw,
  ArrowRight,
  Clock,
} from "lucide-react";
import {
  calculateGameStars,
  calculateGameXp,
  saveGameHighScore,
  type GameDefinition,
  type GameDifficulty,
  type GameQuestion,
  type GameResult,
} from "@/lib/games/types";
import { awardXp } from "@/lib/learn-client";
import "@/styles/games.css";

interface GamePlayerProps {
  game: GameDefinition;
  onClose: () => void;
  onRestart?: () => void;
}

export function GamePlayer({ game, onClose, onRestart }: GamePlayerProps) {
  const [difficulty, setDifficulty] = useState<GameDifficulty>("medio");
  const [step, setStep] = useState<"rules" | "playing" | "finished">("rules");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(1);
  const [maxCombo, setMaxCombo] = useState(1);
  const [hits, setHits] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [feedbackShake, setFeedbackShake] = useState(false);
  const [timeLeft, setTimeLeft] = useState(game.timeLimitSeconds ?? 45);
  const [finalResult, setFinalResult] = useState<GameResult | null>(null);

  const questions: GameQuestion[] = game.questions[difficulty] || [];
  const currentQ = questions[currentIdx];
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishGameRef = useRef<() => void>(() => {});

  // Time survival countdown
  useEffect(() => {
    if (step === "playing" && game.type === "time-survival") {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            finishGameRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [step, game.type]);

  const startGame = () => {
    setStep("playing");
    setCurrentIdx(0);
    setScore(0);
    setCombo(1);
    setMaxCombo(1);
    setHits(0);
    setMistakes(0);
    setSelectedOption(null);
    setIsAnswerChecked(false);
    setTimeLeft(game.timeLimitSeconds ?? 45);
  };

  const finishGame = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const totalQ = questions.length || 1;
    const stars = calculateGameStars(hits, totalQ);
    const xp = calculateGameXp(score, stars);

    const result: GameResult = {
      gameId: game.id,
      difficulty,
      score,
      hits,
      mistakes,
      maxCombo,
      stars,
      xpEarned: xp,
      isNewRecord: false,
    };

    const isNew = saveGameHighScore(result);
    result.isNewRecord = isNew;

    // Award XP
    void awardXp(xp);

    setFinalResult(result);
    setStep("finished");
  };
  finishGameRef.current = finishGame;

  const handleSelectOption = (idx: number) => {
    if (isAnswerChecked || !currentQ) return;
    setSelectedOption(idx);
    setIsAnswerChecked(true);

    const isCorrect = idx === currentQ.correctIndex;

    if (isCorrect) {
      const addedPoints = 100 * combo;
      setScore((s) => s + addedPoints);
      setHits((h) => h + 1);
      setCombo((c) => {
        const next = Math.min(4, c + 1);
        setMaxCombo((m) => Math.max(m, next));
        return next;
      });
      if (game.type === "time-survival") {
        setTimeLeft((t) => t + 1);
      }
    } else {
      setMistakes((m) => m + 1);
      setCombo(1);
      setFeedbackShake(true);
      setTimeout(() => setFeedbackShake(false), 500);
      if (game.type === "time-survival") {
        setTimeLeft((t) => Math.max(0, t - 2));
      }
    }

    setTimeout(() => {
      if (currentIdx + 1 < questions.length) {
        setCurrentIdx((i) => i + 1);
        setSelectedOption(null);
        setIsAnswerChecked(false);
      } else {
        finishGame();
      }
    }, 700);
  };

  const handleMapClick = (regionKey: string) => {
    if (isAnswerChecked || !currentQ) return;
    const isCorrect = regionKey === currentQ.targetKey;
    setIsAnswerChecked(true);

    if (isCorrect) {
      setScore((s) => s + 100 * combo);
      setHits((h) => h + 1);
      setCombo((c) => {
        const next = Math.min(4, c + 1);
        setMaxCombo((m) => Math.max(m, next));
        return next;
      });
    } else {
      setMistakes((m) => m + 1);
      setCombo(1);
      setFeedbackShake(true);
      setTimeout(() => setFeedbackShake(false), 500);
    }

    setTimeout(() => {
      if (currentIdx + 1 < questions.length) {
        setCurrentIdx((i) => i + 1);
        setIsAnswerChecked(false);
      } else {
        finishGame();
      }
    }, 800);
  };

  const renderIcon = (name: string, size = 24) => {
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

  return (
    <div
      className="game-runner-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Jogo: ${game.title}`}
    >
      <div className={`game-runner-box ${feedbackShake ? "game-shake" : ""}`}>
        <div className="game-runner-header">
          <div className="flex items-center gap-2">
            <span className="text-primary">{renderIcon(game.iconName, 20)}</span>
            <span className="font-serif font-bold text-base text-foreground">{game.title}</span>
          </div>
          <button
            type="button"
            className="game-runner-close-btn"
            onClick={onClose}
            aria-label="Fechar jogo"
          >
            <X size={20} />
          </button>
        </div>

        {/* STEP 1: RULES */}
        {step === "rules" && (
          <div className="game-rules-screen">
            <div className="game-rules-icon">{renderIcon(game.iconName, 32)}</div>
            <h2 className="game-rules-title">{game.title}</h2>
            <div className="game-rules-text">
              <p className="font-semibold text-foreground mb-1">Como jogar:</p>
              <p>{game.rules}</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                Dificuldade
              </p>
              <div className="game-diff-selector" role="radiogroup" aria-label="Dificuldade">
                {(["facil", "medio", "dificil"] as const).map((diff) => (
                  <button
                    key={diff}
                    type="button"
                    role="radio"
                    aria-checked={difficulty === diff}
                    className={`game-diff-btn ${difficulty === diff ? "selected" : ""}`}
                    onClick={() => setDifficulty(diff)}
                  >
                    {diff === "facil" ? "Fácil" : diff === "medio" ? "Médio" : "Difícil"}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="game-card-btn-play w-full mt-4"
              onClick={startGame}
              aria-label="Começar desafio"
            >
              <span>Começar desafio</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* STEP 2: PLAYING */}
        {step === "playing" && currentQ && (
          <div>
            <div className="game-play-header">
              <div className="flex items-center gap-2">
                <span className="game-combo-pill">COMBO x{combo}</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {currentIdx + 1} / {questions.length}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-primary">{score} pts</span>
                {game.type === "time-survival" && (
                  <span className={`game-timer-badge ${timeLeft <= 10 ? "is-urgent" : ""}`}>
                    <Clock size={14} />
                    {timeLeft}s
                  </span>
                )}
              </div>
            </div>

            <div
              className="game-progress-bar"
              role="progressbar"
              aria-valuenow={currentIdx + 1}
              aria-valuemin={1}
              aria-valuemax={questions.length}
            >
              <div
                className="game-progress-bar-fill"
                style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
              />
            </div>

            {/* Prompt */}
            <div className="game-prompt-card">
              <p className="game-prompt-question">{currentQ.prompt}</p>
            </div>

            {/* MAP CLICK MODE */}
            {game.type === "map-click" && (
              <div className="game-map-container">
                <svg
                  viewBox="0 0 800 450"
                  className="game-world-map-svg"
                  role="img"
                  aria-label="Mapa do mundo interativo"
                >
                  {/* América do Norte */}
                  <path
                    d="M100 80 L280 80 L240 180 L160 210 L100 130 Z"
                    className="game-map-region"
                    onClick={() => handleMapClick("america-norte")}
                    aria-label="América do Norte"
                  />
                  {/* América do Sul */}
                  <path
                    d="M200 230 L290 230 L270 360 L220 380 L180 290 Z"
                    className="game-map-region"
                    onClick={() => handleMapClick("america-sul")}
                    aria-label="América do Sul"
                  />
                  {/* Europa */}
                  <path
                    d="M380 90 L480 85 L470 170 L390 180 Z"
                    className="game-map-region"
                    onClick={() => handleMapClick("europa")}
                    aria-label="Europa"
                  />
                  {/* África */}
                  <path
                    d="M380 190 L490 190 L470 340 L400 340 L370 240 Z"
                    className="game-map-region"
                    onClick={() => handleMapClick("africa")}
                    aria-label="África"
                  />
                  {/* Ásia */}
                  <path
                    d="M490 80 L720 90 L710 240 L540 250 L480 160 Z"
                    className="game-map-region"
                    onClick={() => handleMapClick("asia")}
                    aria-label="Ásia"
                  />
                  {/* Oceania */}
                  <path
                    d="M620 280 L730 280 L720 370 L610 360 Z"
                    className="game-map-region"
                    onClick={() => handleMapClick("oceania")}
                    aria-label="Oceania"
                  />
                </svg>
              </div>
            )}

            {/* MULTIPLE CHOICE / OPTIONS */}
            {currentQ.options && (
              <div className="game-options-grid">
                {currentQ.options.map((option, idx) => {
                  let statusClass = "";
                  if (isAnswerChecked) {
                    if (idx === currentQ.correctIndex) statusClass = "is-correct";
                    else if (idx === selectedOption) statusClass = "is-wrong";
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isAnswerChecked}
                      className={`game-option-btn ${statusClass}`}
                      onClick={() => handleSelectOption(idx)}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: FINISHED / VICTORY */}
        {step === "finished" && finalResult && (
          <div className="game-victory-screen" role="status">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/20 text-accent">
              <Trophy size={36} />
            </div>

            <h2 className="font-serif font-bold text-2xl text-foreground">Desafio Concluído!</h2>

            <div className="game-victory-stars" aria-label={`${finalResult.stars} estrelas`}>
              {[1, 2, 3].map((starIdx) => (
                <Star
                  key={starIdx}
                  size={36}
                  className={starIdx <= finalResult.stars ? "star-active" : ""}
                />
              ))}
            </div>

            <p className="game-victory-score">{finalResult.score} pontos</p>

            <div className="game-victory-stats">
              <span>
                <b>{finalResult.hits}</b> acertos
              </span>
              <span>·</span>
              <span>
                Combo máx: <b>x{finalResult.maxCombo}</b>
              </span>
              <span>·</span>
              <span>
                XP ganho: <b>+{finalResult.xpEarned}</b>
              </span>
            </div>

            {finalResult.isNewRecord && (
              <p className="text-xs font-semibold text-primary bg-primary/10 py-1 px-3 rounded-full">
                Novo recorde pessoal! 🎉
              </p>
            )}

            <div className="game-victory-actions">
              <button
                type="button"
                className="game-card-btn-play"
                onClick={startGame}
                aria-label="Jogar novamente"
              >
                <RotateCcw size={16} />
                <span>Jogar novamente</span>
              </button>
              <button
                type="button"
                className="game-card-btn-challenge"
                onClick={onRestart || onClose}
                aria-label="Trocar de jogo"
              >
                <span>Trocar de jogo</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
