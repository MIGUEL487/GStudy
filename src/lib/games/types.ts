export type GameType =
  | "multiple-choice"
  | "time-survival"
  | "memory-pairs"
  | "sequence-order"
  | "word-hangman"
  | "map-click";

export type GameSubject = "matematica" | "geografia" | "portugues";

export type GameDifficulty = "facil" | "medio" | "dificil";

export interface GameQuestion {
  id: string;
  prompt: string;
  options?: string[];
  correctAnswer?: string | number;
  correctIndex?: number;
  targetKey?: string;
  sequence?: string[];
  explanation?: string;
}

export interface GameDefinition {
  id: string;
  title: string;
  subject: GameSubject;
  type: GameType;
  description: string;
  rules: string;
  iconName: string;
  estimatedMinutes: number;
  timeLimitSeconds?: number;
  questions: Record<GameDifficulty, GameQuestion[]>;
}

export interface GameHighScore {
  gameId: string;
  difficulty: GameDifficulty;
  bestScore: number;
  stars: number;
  updatedAt: string;
}

export interface GameResult {
  gameId: string;
  difficulty: GameDifficulty;
  score: number;
  hits: number;
  mistakes: number;
  maxCombo: number;
  stars: number;
  xpEarned: number;
  isNewRecord: boolean;
}

export const HIGHSCORES_STORAGE_KEY = "gstudy_game_highscores";

export function getStoredHighScores(): Record<string, GameHighScore> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = localStorage.getItem(HIGHSCORES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveGameHighScore(result: GameResult): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const scores = getStoredHighScores();
    const key = `${result.gameId}_${result.difficulty}`;
    const previous = scores[key];
    const isNew = !previous || result.score > previous.bestScore;

    if (isNew) {
      scores[key] = {
        gameId: result.gameId,
        difficulty: result.difficulty,
        bestScore: result.score,
        stars: Math.max(result.stars, previous?.stars ?? 0),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(HIGHSCORES_STORAGE_KEY, JSON.stringify(scores));
    }
    return isNew;
  } catch {
    return false;
  }
}

export function calculateGameStars(hits: number, total: number): number {
  if (total === 0) return 1;
  const ratio = hits / total;
  if (ratio >= 0.85) return 3;
  if (ratio >= 0.6) return 2;
  return 1;
}

export function calculateGameXp(score: number, stars: number): number {
  const base = Math.min(25, Math.max(5, Math.round(score / 50)));
  return base + stars * 5;
}
