import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { normalizeAnswer, seededRandom, shuffled, type GameAnswer } from "@/lib/games/engine";
import type { GameQuestion, GameType } from "@/lib/games/types";
const WorldMap = lazy(() => import("./world-map").then((module) => ({ default: module.WorldMap })));
type Props = {
  question: GameQuestion;
  type: GameType;
  seed: string;
  disabled: boolean;
  onAnswer: (value: GameAnswer) => void;
  onMistake: () => void;
};

function MemoryPairs({ question, seed, disabled, onAnswer, onMistake }: Props) {
  const [cards] = useState(() =>
    shuffled(
      (question.pairs ?? []).flatMap((pair, i) => [
        { id: i * 2, pair: i, value: pair.left },
        { id: i * 2 + 1, pair: i, value: pair.right },
      ]),
      seededRandom(seed + question.id),
    ),
  );
  const [open, setOpen] = useState<number[]>([]),
    [matched, setMatched] = useState<number[]>([]);
  const lock = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const flip = (index: number) => {
    if (disabled || lock.current || open.includes(index) || matched.includes(cards[index]!.pair))
      return;
    const next = [...open, index];
    setOpen(next);
    if (next.length !== 2) return;
    if (cards[next[0]!]!.pair === cards[next[1]!]!.pair) {
      const found = [...matched, cards[index]!.pair];
      setMatched(found);
      setOpen([]);
      if (found.length === question.pairs!.length)
        onAnswer(Object.fromEntries(question.pairs!.map((p) => [p.left, p.right])));
    } else {
      lock.current = true;
      onMistake();
      timer.current = setTimeout(() => {
        lock.current = false;
        setOpen([]);
      }, 650);
    }
  };
  return (
    <div className="game-memory-grid">
      {cards.map((card, index) => {
        const visible = open.includes(index) || matched.includes(card.pair);
        return (
          <button
            key={card.id}
            disabled={disabled || matched.includes(card.pair)}
            aria-label={visible ? card.value : `Carta ${index + 1}`}
            aria-pressed={visible}
            onClick={() => flip(index)}
          >
            {visible ? card.value : "?"}
          </button>
        );
      })}
    </div>
  );
}

function Sequence({ question, seed, disabled, onAnswer }: Props) {
  const [order, setOrder] = useState(() =>
    shuffled(question.sequence ?? [], seededRandom(seed + question.id)),
  );
  const dragged = useRef<number | null>(null);
  const move = (from: number, to: number) => {
    if (disabled || from === to || to < 0 || to >= order.length) return;
    setOrder((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  };
  return (
    <div>
      <ol className="game-sequence">
        {order.map((item, index) => (
          <li
            key={item}
            draggable={!disabled}
            onDragStart={() => {
              dragged.current = index;
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged.current !== null) move(dragged.current, index);
              dragged.current = null;
            }}
          >
            <span>{item}</span>
            <button
              disabled={disabled || index === 0}
              aria-label={`Subir ${item}`}
              onClick={() => move(index, index - 1)}
            >
              ↑
            </button>
            <button
              disabled={disabled || index === order.length - 1}
              aria-label={`Descer ${item}`}
              onClick={() => move(index, index + 1)}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <button className="game-card-btn-play" disabled={disabled} onClick={() => onAnswer(order)}>
        Conferir sequência
      </button>
    </div>
  );
}

function Classification({ question, disabled, onAnswer }: Props) {
  const [selected, setSelected] = useState<string | null>(null),
    [assignments, setAssignments] = useState<Record<string, string>>({});
  const assign = (category: string, item = selected) => {
    if (item && !disabled) {
      setAssignments((current) => ({ ...current, [item]: category }));
      setSelected(null);
    }
  };
  return (
    <div className="game-classification">
      <p>Toque num item e depois numa categoria. Você também pode arrastar.</p>
      <div className="game-classify-items">
        {question.items?.map(({ label }) => (
          <button
            key={label}
            disabled={disabled}
            draggable={!disabled}
            aria-pressed={selected === label}
            onClick={() => setSelected(label)}
            onDragStart={(event) => event.dataTransfer.setData("text/plain", label)}
          >
            {label}
            {assignments[label] && <small> → {assignments[label]}</small>}
          </button>
        ))}
      </div>
      <div className="game-classify-buckets">
        {question.categories?.map((category) => (
          <button
            key={category}
            disabled={disabled}
            onClick={() => assign(category)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const value = event.dataTransfer.getData("text/plain");
              if (question.items?.some((item) => item.label === value)) assign(category, value);
            }}
          >
            {category}
          </button>
        ))}
      </div>
      <button
        className="game-card-btn-play"
        disabled={disabled || question.items?.some((item) => !assignments[item.label])}
        onClick={() => onAnswer(assignments)}
      >
        Conferir classificação
      </button>
    </div>
  );
}

function Hangman({ question, disabled, onAnswer, onMistake }: Props) {
  const answer = String(question.correctAnswer ?? ""),
    normalized = normalizeAnswer(answer);
  const [letters, setLetters] = useState<string[]>([]);
  const locked = useRef(false),
    root = useRef<HTMLDivElement>(null);
  const wrong = letters.filter((letter) => !normalized.includes(letter));
  const guess = (letter: string) => {
    if (disabled || locked.current || letters.includes(letter)) return;
    const next = [...letters, letter];
    setLetters(next);
    const misses = next.filter((value) => !normalized.includes(value)).length;
    if (!normalized.includes(letter)) onMistake();
    if ([...normalized].every((value) => !/[a-z]/.test(value) || next.includes(value))) {
      locked.current = true;
      onAnswer(answer);
    } else if (misses >= 6) {
      locked.current = true;
      onAnswer("[palavra não descoberta]");
    }
  };
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      ref={root}
      tabIndex={0}
      className="game-hangman"
      onKeyDown={(event) => {
        if (!event.ctrlKey && !event.metaKey && !event.altKey && /^[a-z]$/i.test(event.key)) {
          event.preventDefault();
          guess(event.key.toLowerCase());
        }
      }}
    >
      <p aria-label={`${6 - wrong.length} tentativas de letra restantes`}>
        Letras erradas: {wrong.length}/6
      </p>
      <p className="game-secret-word" aria-label="Palavra">
        {[...answer].map((letter, i) =>
          !/[a-z]/.test(normalizeAnswer(letter)) || letters.includes(normalizeAnswer(letter)) ? (
            letter
          ) : (
            <span key={i}>_ </span>
          ),
        )}
      </p>
      <div className="game-letter-grid">
        {[..."abcdefghijklmnopqrstuvwxyz"].map((letter) => (
          <button
            key={letter}
            disabled={disabled || letters.includes(letter)}
            onClick={() => guess(letter)}
          >
            {letter.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GameMechanic(props: Props) {
  const { type, question, disabled, onAnswer } = props;
  const [typed, setTyped] = useState("");
  if (type === "memory-pairs") return <MemoryPairs {...props} />;
  if (type === "sequence-order") return <Sequence {...props} />;
  if (type === "drag-classify") return <Classification {...props} />;
  if (type === "word-hangman") return <Hangman {...props} />;
  if (type === "map-click")
    return (
      <Suspense fallback={<p role="status">Preparando mapa…</p>}>
        <WorldMap disabled={disabled} onAnswer={onAnswer} />
      </Suspense>
    );
  if (type === "typing-fast" || type === "time-survival")
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (typed.trim() && !disabled) onAnswer(typed);
        }}
        className="game-typing"
      >
        <label>
          {type === "time-survival" ? "Digite a resposta" : "Sua resposta"}
          <input
            autoFocus
            value={typed}
            disabled={disabled}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            inputMode={type === "time-survival" ? "decimal" : undefined}
          />
        </label>
        <button className="game-card-btn-play" disabled={disabled || !typed.trim()}>
          Conferir resposta
        </button>
      </form>
    );
  return (
    <div className="game-options-grid">
      {question.options?.map((option, index) => (
        <button
          key={index}
          disabled={disabled}
          className="game-option-btn"
          onClick={() => onAnswer(index)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
