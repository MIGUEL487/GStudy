export type GameType =
  | "multiple-choice"
  | "time-survival"
  | "memory-pairs"
  | "sequence-order"
  | "word-hangman"
  | "typing-fast"
  | "drag-classify"
  | "map-click";

export type GameSubject =
  | "matematica"
  | "geografia"
  | "portugues"
  | "biologia"
  | "historia"
  | "fisica"
  | "ingles"
  | "outros";

export type GameDifficulty = "facil" | "medio" | "dificil";
export type GameLaunch = {
  gameId?: string | undefined;
  seed?: string | undefined;
  difficulty?: GameDifficulty | undefined;
  challengeId?: string | undefined;
};

export interface GameQuestion {
  id: string;
  prompt: string;
  options?: string[] | undefined;
  correctAnswer?: string | number | undefined;
  correctIndex?: number | undefined;
  targetKey?: string | undefined;
  sequence?: string[] | undefined;
  pairs?: { left: string; right: string }[] | undefined;
  categories?: string[] | undefined;
  items?: { label: string; category: string }[] | undefined;
  explanation?: string | undefined;
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
  source?: "local" | "ai";
  topic?: string;
  fixedDifficulty?: GameDifficulty;
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

export const highScoresKey = (userId: string) => `${HIGHSCORES_STORAGE_KEY}:${userId}`;

export function getStoredHighScores(userId?: string): Record<string, GameHighScore> {
  if (!userId) return {};
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = localStorage.getItem(highScoresKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, score]) =>
          score &&
          typeof score === "object" &&
          Number.isSafeInteger(score.bestScore) &&
          score.bestScore >= 0,
      ),
    );
  } catch {
    return {};
  }
}

export function saveGameHighScore(result: GameResult, userId?: string): boolean {
  if (!userId || !Number.isSafeInteger(result.score) || result.score < 0) return false;
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const scores = getStoredHighScores(userId);
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
      localStorage.setItem(highScoresKey(userId), JSON.stringify(scores));
    }
    return isNew;
  } catch {
    return false;
  }
}

export function cacheGameHighScores(
  userId: string,
  records: Record<string, GameHighScore>,
): boolean {
  try {
    const current = getStoredHighScores(userId);
    for (const [key, record] of Object.entries(records)) {
      if (!current[key] || record.bestScore > current[key]!.bestScore) current[key] = record;
    }
    localStorage.setItem(highScoresKey(userId), JSON.stringify(current));
    return true;
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
