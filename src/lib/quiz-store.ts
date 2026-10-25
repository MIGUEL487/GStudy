import { signalAccountChange } from "./account-sync-model";
import {
  quizDocumentKey,
  quizDocumentSchema,
  readQuizProgress,
  type QuizProgress,
} from "./quiz-progress";
export const quizUpdatedEvent = "gstudy-quizzes-updated";
export function readQuizDocument(user: string) {
  const raw = localStorage.getItem(quizDocumentKey(user));
  return raw ? quizDocumentSchema.parse(JSON.parse(raw)) : { version: 1 as const, sessions: [] };
}
export function savedQuiz(user: string, activity: string, legacyKey: string) {
  try {
    const record = readQuizDocument(user)
      .sessions.filter((row) => row.activity === activity)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return record ? { value: record.progress, error: "" } : readQuizProgress(legacyKey);
  } catch {
    return {
      value: null,
      error: "Não foi possível ler os quizzes salvos. Seus dados foram preservados.",
    };
  }
}
export function saveQuiz(user: string, activity: string, progress: QuizProgress) {
  try {
    const document = readQuizDocument(user);
    const existing = document.sessions.find((row) => row.id === progress.sessionId);
    const record = {
      id: progress.sessionId,
      activity,
      progress,
      updatedAt: Date.now(),
      copies: existing?.copies ?? [],
    };
    document.sessions = [...document.sessions.filter((row) => row.id !== record.id), record];
    localStorage.setItem(quizDocumentKey(user), JSON.stringify(quizDocumentSchema.parse(document)));
    signalAccountChange();
    window.dispatchEvent(new Event(quizUpdatedEvent));
    return true;
  } catch {
    return false;
  }
}
