import { describe, expect, it, vi } from "vitest";
import { prepareQuizQuestions, type QuizQuestion } from "@/components/quiz-lesson";
import { condenseNotionContent } from "@/lib/notion.server";

describe("2.3 Quiz: descarte de perguntas inválidas e shuffle", () => {
  it("descarta perguntas cujo answer é negativo ou além do intervalo (sem clamp)", () => {
    const raw: QuizQuestion[] = [
      {
        question: "Pergunta válida",
        options: ["A", "B", "C"],
        answer: 1,
        why: "B está correto",
      },
      {
        question: "Pergunta com índice negativo",
        options: ["A", "B"],
        answer: -1,
        why: "Inválida",
      },
      {
        question: "Pergunta com índice fora do range",
        options: ["A", "B", "C"],
        answer: 5,
        why: "Inválida",
      },
      {
        question: "Pergunta com poucas opções",
        options: ["Apenas 1"],
        answer: 0,
        why: "Inválida",
      },
    ];

    const prepared = prepareQuizQuestions(raw);
    expect(prepared).toHaveLength(1);
    expect(prepared[0]?.question).toBe("Pergunta válida");
  });

  it("embaralha opções e preserva o texto da resposta correta no novo índice", () => {
    const raw: QuizQuestion[] = [
      {
        question: "Qual a capital do Brasil?",
        options: ["Buenos Aires", "Brasília", "Santiago", "Lima"],
        answer: 1, // "Brasília"
        why: "Brasília é a capital federal",
      },
    ];

    // Testa com diferentes seeds de shuffle
    for (let seed = 0; seed < 5; seed++) {
      let pseudoRand = seed * 0.2;
      const prepared = prepareQuizQuestions(raw, () => {
        pseudoRand = (pseudoRand + 0.37) % 1;
        return pseudoRand;
      });

      expect(prepared).toHaveLength(1);
      const q = prepared[0]!;
      expect(q.options).toHaveLength(4);
      expect(q.options[q.answer]).toBe("Brasília");
    }
  });
});

describe("2.7 Notion: condensação e limite de memória", () => {
  it("mantém texto curto intacto sem chamar IA", async () => {
    const shortText = "Texto curto com menos de 30 mil caracteres.";
    const result = await condenseNotionContent(shortText, "user-123");
    expect(result).toBe(shortText);
  });

  it("condensa ou trunca texto acima de 30 mil caracteres para proteger memoryOf", async () => {
    const longText = "Conceito importante para vestibular e concurso. ".repeat(1000);
    expect(longText.length).toBeGreaterThan(40000);

    const result = await condenseNotionContent(longText, "user-123");
    expect(result.length).toBeLessThanOrEqual(30000);
  });
});
