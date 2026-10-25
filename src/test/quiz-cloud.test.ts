import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  quizHeartEvent,
  quizDocumentKey,
  quizDocumentSchema,
  type QuizProgress,
} from "@/lib/quiz-progress";
import { fingerprint, mergeAccountDocuments, parseAccountDocument } from "@/lib/account-sync-model";
import { saveQuiz, savedQuiz, readQuizDocument } from "@/lib/quiz-store";
const id = "11111111-1111-4111-8111-111111111111";
const initial: QuizProgress = {
  sessionId: id,
  questions: Array.from({ length: 3 }, () => ({
    question: "Qual?",
    options: ["A", "B"],
    answer: 0,
    why: "Porque.",
  })),
  index: 0,
  pick: null,
  checked: false,
  right: 0,
  done: false,
  mistakes: [],
  pendingHeartId: null,
};
const doc = (progress: QuizProgress, updatedAt = 1) =>
  parseAccountDocument("quizzes", {
    version: 1,
    sessions: [{ id: progress.sessionId, activity: "biology", updatedAt, progress, copies: [] }],
  });
beforeEach(() => localStorage.clear());
describe("quiz entre aparelhos", () => {
  it("mantém progresso como uma unidade e preserva respostas conflitantes", () => {
    const a = { ...initial, pick: 0, checked: true, right: 1 };
    const b = {
      ...initial,
      pick: 1,
      checked: true,
      mistakes: [0],
      pendingHeartId: quizHeartEvent(id, 0),
    };
    const base = fingerprint(doc(initial));
    const left = mergeAccountDocuments("quizzes", base, doc(a, 2), doc(b, 3));
    const right = mergeAccountDocuments("quizzes", base, doc(b, 3), doc(a, 2));
    expect(left.document).toEqual(right.document);
    const record = quizDocumentSchema.parse(left.document).sessions[0]!;
    expect(record.progress).toEqual(b);
    expect(record.copies).toContainEqual(a);
  });
  it("avanço sequencial não cria conflitos artificiais ou mistura contagens", () => {
    const next = { ...initial, index: 1, right: 1 };
    const merged = mergeAccountDocuments("quizzes", undefined, doc(initial), doc(next, 2));
    expect(quizDocumentSchema.parse(merged.document).sessions[0]!).toMatchObject({
      progress: next,
      copies: [],
    });
  });
  it("gera a mesma cobrança em ambos os aparelhos e IDs distintos por pergunta", () => {
    const values = Array.from({ length: 100 }, (_, index) => quizHeartEvent(id, index));
    expect(new Set(values).size).toBe(100);
    expect(quizHeartEvent(id, 4)).toBe(values[4]);
    expect(
      values.every((value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(value),
      ),
    ).toBe(true);
  });
  it("importa legado sem apagar o backup e separa as contas", () => {
    localStorage.setItem("legacy", JSON.stringify(initial));
    expect(savedQuiz("A", "biology", "legacy").value).toEqual(initial);
    expect(saveQuiz("A", "biology", initial)).toBe(true);
    expect(localStorage.getItem("legacy")).not.toBeNull();
    expect(readQuizDocument("B").sessions).toEqual([]);
    expect(savedQuiz("A", "biology", "missing").value).toEqual(initial);
  });
  it("preserva dados inválidos e informa falhas de armazenamento", () => {
    localStorage.setItem(quizDocumentKey("A"), "broken");
    expect(saveQuiz("A", "biology", initial)).toBe(false);
    expect(savedQuiz("A", "biology", "legacy").error).toBeTruthy();
    expect(localStorage.getItem(quizDocumentKey("A"))).toBe("broken");
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(saveQuiz("B", "biology", initial)).toBe(false);
    spy.mockRestore();
  });
});
