import { useEffect, useRef, useState } from "react";
import { ArrowRight, RotateCcw, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useHearts } from "@/components/hearts-provider";
import {
  calculateGameStars,
  calculateGameXp,
  getStoredHighScores,
  saveGameHighScore,
  type GameDefinition,
  type GameDifficulty,
  type GameQuestion,
  type GameResult,
} from "@/lib/games/types";
import {
  applyGameAnswer,
  gameSequence,
  initialGameProgress,
  type GameAnswer,
} from "@/lib/games/engine";
import { submitGameResult } from "@/lib/games/rpc";
import { GameMechanic } from "./game-mechanic";
import { MistakeExplanation } from "./mistake-explanation";
import { ChallengeResults } from "./challenge-results";
import "@/styles/games.css";

interface GamePlayerProps {
  game: GameDefinition;
  onClose: () => void;
  onRestart?: () => void;
  seed?: string | undefined;
  difficulty?: GameDifficulty | undefined;
  challengeId?: string | undefined;
}
export function GamePlayer({
  game,
  onClose,
  onRestart,
  seed: suppliedSeed,
  difficulty: suppliedDifficulty,
  challengeId,
}: GamePlayerProps) {
  const userId = useHearts()?.userId;
  const [difficulty, setDifficulty] = useState<GameDifficulty>(
    suppliedDifficulty ?? game.fixedDifficulty ?? "medio",
  );
  const [step, setStep] = useState<"rules" | "playing" | "finished">("rules");
  const [sequence, setSequence] = useState<GameQuestion[]>([]),
    [seed, setSeed] = useState("");
  const progress = useRef(initialGameProgress());
  const [state, setState] = useState(progress.current),
    [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<boolean | null>(null),
    [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null),
    [error, setError] = useState("");
  const [awarded, setAwarded] = useState<number | null>(null),
    [saving, setSaving] = useState(false);
  const run = useRef({ id: "", finished: false, locked: false, deadline: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    alive = useRef(true);
  const timeBar = useRef<HTMLDivElement>(null),
    finishRef = useRef<() => void>(() => {});
  const pendingResult = useRef<Parameters<typeof submitGameResult>[0] | null>(null);
  const limit = game.timeLimitSeconds ?? (game.type === "time-survival" ? 45 : 0);
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimer();
    };
  }, []);
  const saveResult = async () => {
    const payload = pendingResult.current;
    if (!payload || saving) return;
    const eventId = payload.eventId;
    setSaving(true);
    try {
      const saved = await submitGameResult(payload);
      if (alive.current && run.current.id === eventId) {
        setAwarded(saved.awarded);
        setError("");
      }
    } catch (cause) {
      if (alive.current && run.current.id === eventId)
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível registrar a partida. Seu resultado continua aqui.",
        );
    } finally {
      if (alive.current && run.current.id === eventId) setSaving(false);
    }
  };
  const finish = () => {
    if (run.current.finished || !run.current.id) return;
    run.current.finished = true;
    run.current.locked = true;
    clearTimer();
    const latest = progress.current;
    const stars = calculateGameStars(latest.hits, latest.hits + latest.mistakes);
    const final: GameResult = {
      gameId: game.id,
      difficulty,
      score: latest.score,
      hits: latest.hits,
      mistakes: latest.mistakes,
      maxCombo: latest.maxCombo,
      stars,
      xpEarned: calculateGameXp(latest.score, stars),
      isNewRecord: false,
    };
    final.isNewRecord = saveGameHighScore(final, userId);
    if (
      userId &&
      (getStoredHighScores(userId)[`${game.id}_${difficulty}`]?.bestScore ?? -1) < final.score
    )
      setError("Não foi possível salvar o recorde neste navegador. Seu resultado continua aqui.");
    pendingResult.current = {
      ...final,
      seed,
      eventId: run.current.id,
      total: sequence.length,
      ...(challengeId ? { challengeId } : {}),
    };
    setResult(final);
    setStep("finished");
    void saveResult();
  };
  finishRef.current = finish;
  useEffect(() => {
    if (step !== "playing" || !limit) return;
    let frame = 0;
    const tick = () => {
      if (run.current.finished) return;
      const remaining = Math.max(0, (run.current.deadline - performance.now()) / 1000);
      if (timeBar.current)
        timeBar.current.style.transform = `scaleX(${Math.min(1, remaining / limit)})`;
      setSeconds((current) => (current === Math.ceil(remaining) ? current : Math.ceil(remaining)));
      if (!remaining) finishRef.current();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step, limit]);
  const start = () => {
    clearTimer();
    const nextSeed = suppliedSeed ?? crypto.randomUUID();
    run.current = {
      id: crypto.randomUUID(),
      finished: false,
      locked: false,
      deadline: performance.now() + limit * 1000,
    };
    progress.current = initialGameProgress();
    pendingResult.current = null;
    setState(progress.current);
    setSeed(nextSeed);
    setSequence(gameSequence(game, difficulty, nextSeed));
    setIndex(0);
    setFeedback(null);
    setSeconds(limit);
    setResult(null);
    setAwarded(null);
    setSaving(false);
    setError("");
    setStep("playing");
  };
  const answer = (value: GameAnswer) => {
    const question = sequence[index];
    if (step !== "playing" || run.current.locked || run.current.finished || !question) return;
    run.current.locked = true;
    const next = applyGameAnswer(progress.current, question, value);
    progress.current = next;
    setState(next);
    const correct = next.answers.at(-1)!.correct;
    setFeedback(correct);
    if (game.type === "time-survival")
      run.current.deadline = Math.min(
        performance.now() + limit * 1000,
        run.current.deadline + (correct ? 3000 : -2000),
      );
    if (limit && run.current.deadline <= performance.now()) {
      finishRef.current();
      return;
    }
    timer.current = setTimeout(() => {
      if (!alive.current || run.current.finished) return;
      if (index + 1 >= sequence.length) finishRef.current();
      else {
        setIndex(index + 1);
        setFeedback(null);
        run.current.locked = false;
      }
    }, 700);
  };
  const slip = () => {
    if (run.current.locked || run.current.finished) return;
    progress.current = {
      ...progress.current,
      mistakes: progress.current.mistakes + 1,
      combo: 1,
      answers: [
        ...progress.current.answers,
        { question: sequence[index]!, answer: "Tentativa incorreta", correct: false },
      ],
    };
    setState(progress.current);
  };
  const question = sequence[index];
  const mistakes = [
    ...new Map(
      state.answers.filter((item) => !item.correct).map((item) => [item.question.id, item]),
    ).values(),
  ];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="game-runner-box game-dialog"
        aria-describedby={step === "rules" ? "game-rules" : undefined}
        onKeyDown={(event) => {
          if (
            step === "playing" &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            game.type === "multiple-choice" &&
            /^[1-4]$/.test(event.key) &&
            question?.options &&
            Number(event.key) <= question.options.length
          ) {
            event.preventDefault();
            answer(Number(event.key) - 1);
          }
        }}
      >
        <DialogTitle>{game.title}</DialogTitle>
        {step === "rules" && (
          <div className="game-rules-screen">
            <p id="game-rules">{game.rules}</p>
            <p>Acertos aumentam o combo, até ×4. Os jogos não gastam corações.</p>
            <div className="game-diff-selector" role="radiogroup" aria-label="Dificuldade">
              {(["facil", "medio", "dificil"] as const).map((value) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={difficulty === value}
                  disabled={Boolean(suppliedDifficulty || game.fixedDifficulty)}
                  className={`game-diff-btn ${difficulty === value ? "selected" : ""}`}
                  onClick={() => setDifficulty(value)}
                >
                  {value === "facil" ? "Fácil" : value === "medio" ? "Médio" : "Difícil"}
                </button>
              ))}
            </div>
            {suppliedSeed && <p>Desafio com a mesma sequência para todos.</p>}
            <button className="game-card-btn-play" onClick={start} aria-label="Começar desafio">
              Começar desafio <ArrowRight size={16} />
            </button>
          </div>
        )}
        {step === "playing" && question && (
          <div>
            <div className="game-play-header">
              <span className="game-combo-pill">COMBO x{state.combo}</span>
              <span>{state.score} pts</span>
              {limit > 0 && <span aria-label="Tempo restante">{seconds}s</span>}
            </div>
            <div
              className="game-progress-bar"
              role="progressbar"
              aria-label="Progresso da partida"
              aria-valuemin={0}
              aria-valuemax={sequence.length}
              aria-valuenow={index}
            >
              <div
                className="game-progress-bar-fill"
                style={{ width: "100%", transform: `scaleX(${index / sequence.length})` }}
              />
            </div>
            {limit > 0 && (
              <div
                className="game-time-track"
                role="meter"
                aria-label="Reserva de tempo"
                aria-valuemin={0}
                aria-valuemax={limit}
                aria-valuenow={seconds}
              >
                <div ref={timeBar} />
              </div>
            )}
            <h2 className="game-prompt-question">{question.prompt}</h2>
            <GameMechanic
              key={`${seed}:${index}`}
              question={question}
              type={game.type}
              seed={seed}
              disabled={feedback !== null}
              onAnswer={answer}
              onMistake={slip}
            />
            {feedback !== null && (
              <p
                role="status"
                className={`game-answer-feedback ${feedback ? "is-correct" : "is-wrong"}`}
              >
                {feedback ? "Você acertou!" : "Vamos revisar essa no resultado."}{" "}
                {question.explanation}
              </p>
            )}
          </div>
        )}
        {step === "finished" && result && (
          <div className="game-victory-screen">
            <Trophy size={36} />
            <h2>Desafio concluído!</h2>
            <p className="game-victory-score">{result.score} pontos</p>
            <p>
              {result.hits} acertos · {result.mistakes} erros · Combo máx. ×{result.maxCombo}
            </p>
            <p>
              {saving
                ? "Registrando partida…"
                : awarded !== null
                  ? `XP registrado: +${awarded}`
                  : "XP ainda não registrado"}
            </p>
            {result.isNewRecord && <p>Novo recorde pessoal!</p>}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {error && (
              <button
                className="game-card-btn-play"
                onClick={() => void saveResult()}
                disabled={saving}
              >
                Tentar salvar partida
              </button>
            )}
            {!!mistakes.length && (
              <section aria-label="Revisão dos erros">
                <h3>Vamos rever</h3>
                {mistakes.map(({ question: item }, i) => (
                  <article key={i}>
                    <h4>{item.prompt}</h4>
                    <MistakeExplanation question={item} />
                  </article>
                ))}
              </section>
            )}
            {challengeId && <ChallengeResults id={challengeId} revision={awarded} />}
            <div className="game-victory-actions">
              <button className="game-card-btn-play" onClick={start} aria-label="Jogar novamente">
                <RotateCcw size={16} /> Jogar novamente
              </button>
              <button className="game-card-btn-challenge" onClick={onRestart ?? onClose}>
                Trocar de jogo
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
