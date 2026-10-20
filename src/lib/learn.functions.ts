import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { requireStudyAuth } from "@/lib/study-auth-middleware";
import { z } from "zod";
import type { ModelMessage } from "ai";
import {
  arraySchema,
  boardImageSchema,
  cleanLearningText,
  learningContextSchema,
  learningLanguage,
  learningMemory,
  learningReference,
  materialIdsSchema,
  objectSchema as obj,
  outputText,
  stringSchema as s,
  studentPersonas,
  validatedLearningOutput,
  type ActivityContext,
} from "./learning-ai";
import { enforceServerAiQuota } from "./server-ai-quota";
import { createAiTelemetry } from "./ai-telemetry.server";

const str = (n: number) => z.string().max(n);

function stripHtml(html: string) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30000);
}

const addInput = z.object({
  title: str(120).trim().min(1),
  kind: z.enum(["file", "link", "summary"]),
  text: str(60000).optional(),
  url: str(500).optional(),
  file: z
    .object({
      dataUrl: str(4_200_000), // Limite reduzido para respeitar payload serverless
      mediaType: str(100),
      name: str(200),
    })
    .optional(),
});

export const addMaterial = createServerFn({ method: "POST" })
  .middleware([requireStudyAuth])
  .validator((i: unknown) => addInput.parse(i))
  .handler(async ({ data, context }) => {
    await enforceServerAiQuota(context.supabase, context.userId, "material");

    const { aiText } = await import("./ai.server");
    type Part =
      | { type: "text"; text: string }
      | { type: "file"; data: string; mediaType: string }
      | { type: "image"; image: string };
    const parts: Part[] = [];
    let source: string | null = null;

    if (data.kind === "link") {
      const { safeFetch } = await import("./safe-fetch.server");
      const targetUrl = /^https?:\/\//i.test(data.url ?? "") ? data.url! : `https://${data.url}`;
      let page = "";
      let finalUrl = targetUrl;
      try {
        const fetched = await safeFetch(targetUrl);
        page = stripHtml(fetched.text);
        finalUrl = fetched.finalUrl;
      } catch (err: unknown) {
        if (err instanceof Error) {
          throw new Error(err.message);
        }
        throw new Error("Não consegui abrir esse link. Tente colar o texto como resumo.");
      }
      if (!page) {
        throw new Error("Não consegui abrir esse link. Tente colar o texto como resumo.");
      }
      source = finalUrl;
      parts.push({ type: "text", text: `Conteúdo da página ${finalUrl}:\n${page}` });
    }

    if (data.text?.trim()) {
      parts.push({ type: "text", text: data.text });
    }

    if (data.file) {
      source = data.file.name;
      const m = data.file.mediaType.toLowerCase();
      const isTextFile =
        m.startsWith("text/") ||
        m === "application/json" ||
        data.file.name.endsWith(".txt") ||
        data.file.name.endsWith(".md");

      if (m.startsWith("image/")) {
        parts.push({ type: "image", image: data.file.dataUrl });
      } else if (m === "application/pdf") {
        parts.push({ type: "file", data: data.file.dataUrl, mediaType: m });
      } else if (isTextFile) {
        // Extrai texto de arquivo base64 ou data URL
        try {
          const rawBase64 = data.file.dataUrl.includes(",")
            ? data.file.dataUrl.split(",")[1] || ""
            : data.file.dataUrl;
          const decodedText = Buffer.from(rawBase64, "base64").toString("utf-8");
          parts.push({
            type: "text",
            text: `Conteúdo do arquivo ${data.file.name}:\n${decodedText.slice(0, 30000)}`,
          });
        } catch {
          throw new Error("Não foi possível decodificar o arquivo de texto.");
        }
      } else {
        throw new Error("Envie PDF, imagem ou arquivo de texto (.txt, .md).");
      }
    }

    if (!parts.length) {
      throw new Error("Adicione algum conteúdo.");
    }

    const messages: ModelMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: `Material: "${data.title}"` },
          ...(parts as unknown as Array<{ type: "text"; text: string }>),
        ],
      },
    ];

    const memory = await aiText(
      `${learningLanguage}\nVocê é a memória de estudos de um estudante brasileiro. Leia o material e escreva notas de estudo organizadas: conceitos-chave, definições, fórmulas, datas e exemplos. Use tópicos curtos em Markdown. No máximo 600 palavras. Não invente nada que não esteja no material.`,
      messages,
    );

    const { data: row, error } = await context.supabase
      .from("study_materials")
      .insert({
        user_id: context.userId,
        title: data.title,
        kind: data.kind,
        source,
        memory: cleanLearningText(memory),
      })
      .select()
      .single();

    if (error) {
      throw new Error("Não foi possível salvar o material.");
    }
    return row;
  });

const genInput = z.object({
  mode: z.enum(["quiz", "flashcards", "explain"]),
  ids: materialIdsSchema,
  context: learningContextSchema.optional(),
  regenerate: z.boolean().optional(),
});

export type Quiz = {
  questions: { question: string; options: string[]; answer: number; why: string }[];
};
export type Cards = { cards: { front: string; back: string }[] };
export type Explain = { topics: { title: string; explanation: string; example: string }[] };

export function computeActivityCacheKey(
  userId: string,
  mode: string,
  materialIds: string[],
  context?: ActivityContext,
): string {
  const sorted = [...materialIds].sort().join(",");
  const ctx = context ? `${context.subject}:${context.topic}:${context.goal || ""}` : "default";
  const str = `${userId}:${mode}:${sorted}:${ctx}`;
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, "0");
}

export async function getCachedActivity(
  supabase: SupabaseClient<Database>,
  userId: string,
  cacheKey: string,
) {
  try {
    const { data, error } = await supabase
      .from("ai_activity_cache")
      .select("payload")
      .eq("user_id", userId)
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (!error && data?.payload) {
      return data.payload;
    }
  } catch {
    // Graceful fallback to live generation
  }
  return null;
}

export async function saveCachedActivity(
  supabase: SupabaseClient<Database>,
  userId: string,
  cacheKey: string,
  mode: string,
  payload: unknown,
) {
  try {
    await supabase.from("ai_activity_cache").upsert(
      {
        user_id: userId,
        cache_key: cacheKey,
        mode,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,cache_key" },
    );
  } catch {
    // Cache write failure does not break user interaction
  }
}

const quizOutput = z.object({
  questions: z
    .array(
      z.object({
        question: outputText(1200, 5),
        options: z
          .array(outputText(600))
          .length(4)
          .refine(
            (options) =>
              new Set(options.map((option) => option.toLocaleLowerCase("pt-BR"))).size === 4,
          ),
        answer: z.number().int().min(0).max(3),
        why: outputText(1800),
      }),
    )
    .length(6),
});

const cardsOutput = z.object({
  cards: z.array(z.object({ front: outputText(800, 2), back: outputText(1600, 2) })).length(10),
});

const explainOutput = z.object({
  topics: z
    .array(
      z.object({
        title: outputText(180),
        explanation: outputText(6000),
        example: outputText(3000),
      }),
    )
    .min(4)
    .max(6),
});

export const generateActivity = createServerFn({ method: "POST" })
  .middleware([requireStudyAuth])
  .validator((i: unknown) => genInput.parse(i))
  .handler(async ({ data, context }) => {
    const cacheKey = computeActivityCacheKey(context.userId, data.mode, data.ids, data.context);

    // Cache (Item A6): Se já gerado para este usuário e contexto, devolve na hora (< 100ms)
    if (!data.regenerate) {
      const cached = await getCachedActivity(context.supabase, context.userId, cacheKey);
      if (cached) {
        console.log(`[GStudy AI Cache] Hit para ${data.mode} (${cacheKey.slice(0, 8)})`);
        return cached as { mode: typeof data.mode; [key: string]: unknown };
      }
    }

    const telemetry = createAiTelemetry(data.mode);
    const tStartDb = performance.now();

    // Infra (Item A7): Paraleliza leitura de cota e busca de memória de estudos
    const [, mem] = await Promise.all([
      enforceServerAiQuota(context.supabase, context.userId, data.mode),
      learningMemory(context.supabase, data.ids, !data.context, 12_000),
    ]);

    telemetry.supabase_read_ms = performance.now() - tStartDb;
    const tStartPrompt = performance.now();

    const { aiObject } = await import("./ai.server");
    const msg: ModelMessage[] = [
      { role: "user" as const, content: learningReference(data.context, mem) },
    ];
    telemetry.prompt_build_ms = performance.now() - tStartPrompt;

    if (data.mode === "quiz") {
      // Geração em lotes paralelos (Item A3): dispara 2 lotes de 3 perguntas em paralelo
      const batch1Promise = Promise.resolve()
        .then(() =>
          aiObject<Quiz>(
            `${learningLanguage}\nCrie exatamente 3 perguntas de múltipla escolha sobre os fundamentos da etapa indicada. Cada uma deve ter 4 opções distintas e curtas, o índice da resposta correta (0 a 3) e uma explicação curta. Avalie compreensão.`,
            msg,
            obj({
              questions: arraySchema(
                obj({
                  question: s,
                  options: arraySchema(s, 4),
                  answer: { type: "integer", minimum: 0, maximum: 3 },
                  why: s,
                }),
                3,
              ),
            }),
            { maxOutputTokens: 800, onUsage: () => {} },
          ),
        )
        .catch(() => null);

      const batch2Promise = Promise.resolve()
        .then(() =>
          aiObject<Quiz>(
            `${learningLanguage}\nCrie exatamente 3 perguntas de múltipla escolha sobre aplicações práticas e aprofundamento da etapa indicada. Cada uma deve ter 4 opções distintas e curtas, o índice da resposta correta (0 a 3) e uma explicação curta. Não repita os mesmos enunciados do básico.`,
            msg,
            obj({
              questions: arraySchema(
                obj({
                  question: s,
                  options: arraySchema(s, 4),
                  answer: { type: "integer", minimum: 0, maximum: 3 },
                  why: s,
                }),
                3,
              ),
            }),
            { maxOutputTokens: 800, onUsage: () => {} },
          ),
        )
        .catch(() => null);

      const [b1, b2] = await Promise.all([batch1Promise, batch2Promise]);
      let rawQuestions: Quiz["questions"] = [];

      if (b1?.questions && b2?.questions) {
        // Deduplicação entre lotes (Item A3)
        const seen = new Set<string>();
        rawQuestions = [...b1.questions, ...b2.questions].filter((q) => {
          const key = q.question.trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      } else if (b1?.questions?.length === 6) {
        rawQuestions = b1.questions;
      } else {
        const full = await aiObject<Quiz>(
          `${learningLanguage}\nCrie exatamente 6 perguntas de múltipla escolha sobre a etapa indicada. Cada uma deve ter exatamente 4 opções distintas e curtas, o índice (0 a 3) da única resposta correta e uma explicação curta.`,
          msg,
          obj({
            questions: arraySchema(
              obj({
                question: s,
                options: arraySchema(s, 4),
                answer: { type: "integer", minimum: 0, maximum: 3 },
                why: s,
              }),
              6,
            ),
          }),
          { maxOutputTokens: 1400, onUsage: () => {} },
        );
        rawQuestions = full.questions;
      }

      if (rawQuestions.length < 6 && b1?.questions) {
        rawQuestions = [...rawQuestions, ...b1.questions].slice(0, 6);
      }

      const result = {
        mode: "quiz" as const,
        quiz: validatedLearningOutput(quizOutput, { questions: rawQuestions.slice(0, 6) }),
      };

      await saveCachedActivity(context.supabase, context.userId, cacheKey, "quiz", result);
      telemetry.finish();
      return result;
    }

    if (data.mode === "flashcards") {
      // Geração em lotes paralelos (Item A3): dispara 2 lotes de 5 flashcards em paralelo
      const batch1Promise = Promise.resolve()
        .then(() =>
          aiObject<Cards>(
            `${learningLanguage}\nCrie exatamente 5 flashcards sobre conceitos centrais e definições da etapa indicada. Frente: pergunta específica ou termo. Verso: resposta clara em até 2 frases. Use somente texto simples sem Markdown ou LaTeX.`,
            msg,
            obj({ cards: arraySchema(obj({ front: s, back: s }), 5) }),
            { maxOutputTokens: 600, onUsage: () => {} },
          ),
        )
        .catch(() => null);

      const batch2Promise = Promise.resolve()
        .then(() =>
          aiObject<Cards>(
            `${learningLanguage}\nCrie exatamente 5 flashcards sobre relações, causas e aplicações da etapa indicada. Frente: pergunta específica ou termo. Verso: resposta clara em até 2 frases. Use somente texto simples sem Markdown ou LaTeX.`,
            msg,
            obj({ cards: arraySchema(obj({ front: s, back: s }), 5) }),
            { maxOutputTokens: 600, onUsage: () => {} },
          ),
        )
        .catch(() => null);

      const [b1, b2] = await Promise.all([batch1Promise, batch2Promise]);
      let rawCards: Cards["cards"] = [];

      if (b1?.cards && b2?.cards) {
        const seen = new Set<string>();
        rawCards = [...b1.cards, ...b2.cards].filter((c) => {
          const key = c.front.trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      } else if (b1?.cards?.length === 10) {
        rawCards = b1.cards;
      } else {
        const full = await aiObject<Cards>(
          `${learningLanguage}\nCrie exatamente 10 flashcards sobre a etapa indicada. Frente: pergunta específica ou termo. Verso: resposta clara em até 2 frases. Use somente texto legível sem Markdown.`,
          msg,
          obj({ cards: arraySchema(obj({ front: s, back: s }), 10) }),
          { maxOutputTokens: 1200, onUsage: () => {} },
        );
        rawCards = full.cards;
      }

      if (rawCards.length < 10 && b1?.cards) {
        rawCards = [...rawCards, ...b1.cards].slice(0, 10);
      }

      const result = {
        mode: "flashcards" as const,
        cards: validatedLearningOutput(cardsOutput, { cards: rawCards.slice(0, 10) }),
      };

      await saveCachedActivity(context.supabase, context.userId, cacheKey, "flashcards", result);
      telemetry.finish();
      return result;
    }

    const r = await aiObject<Explain>(
      `${learningLanguage}\nExplique os 4 a 6 conceitos mais importantes desta etapa com clareza pedagógica: linguagem simples, conexão entre ideias e analogias do dia a dia. Para cada um: title, explanation (até 100 palavras) e um exemplo prático (example).`,
      msg,
      obj({ topics: arraySchema(obj({ title: s, explanation: s, example: s }), 4, 6) }),
      { maxOutputTokens: 1600, onUsage: () => {} },
    );
    const result = { mode: "explain" as const, explain: validatedLearningOutput(explainOutput, r) };
    await saveCachedActivity(context.supabase, context.userId, cacheKey, "explain", result);
    telemetry.finish();
    return result;
  });

export const pregenerateNextActivity = createServerFn({ method: "POST" })
  .middleware([requireStudyAuth])
  .validator((i: unknown) => genInput.parse(i))
  .handler(async ({ data, context }) => {
    // Pré-geração em segundo plano (Item A6): respeita cota e só gera se ainda não estiver em cache
    const cacheKey = computeActivityCacheKey(context.userId, data.mode, data.ids, data.context);
    const cached = await getCachedActivity(context.supabase, context.userId, cacheKey);
    if (cached) return { cached: true };

    try {
      await generateActivity({ data: { ...data, regenerate: false } });
      return { pregenerated: true };
    } catch {
      return { pregenerated: false };
    }
  });

const feynInput = z.object({
  topic: str(200),
  ids: materialIdsSchema,
  context: learningContextSchema.optional(),
  studentId: z.enum(["gui", "lia", "rafa", "maya"]).default("gui"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: str(8000),
        board: boardImageSchema.optional(),
      }),
    )
    .min(1)
    .max(40),
});

export const feynmanReply = createServerFn({ method: "POST" })
  .middleware([requireStudyAuth])
  .validator((i: unknown) => feynInput.parse(i))
  .handler(async ({ data, context }) => {
    await enforceServerAiQuota(context.supabase, context.userId, "feynman");

    const { aiText } = await import("./ai.server");
    const mem = await learningMemory(context.supabase, data.ids, !data.context);
    const reference = learningReference(
      data.context ?? { subject: "Estudo livre", topic: data.topic },
      mem,
    );
    const student = studentPersonas[data.studentId];
    const last = data.messages.length - 1;

    // Envia o board apenas na última mensagem para otimizar payload (Item 2.6b)
    const messages: ModelMessage[] = data.messages.map((m, i) =>
      m.role === "assistant"
        ? { role: "assistant" as const, content: m.text }
        : {
            role: "user" as const,
            content: [
              { type: "text" as const, text: m.text || "(veja a lousa)" },
              ...(m.board && i === last
                ? [{ type: "image" as const, image: m.board }]
                : m.board
                  ? [{ type: "text" as const, text: "[a professora desenhou na lousa]" }]
                  : []),
            ],
          },
    );

    const text = await aiText(
      `${learningLanguage}\nVocê é ${student.name}, estudante de 14 anos que ${student.style}, numa aula pelo Método Feynman. A pessoa está ensinando o tema "${data.topic}". Mantenha seu nome ${student.name} e seu estilo, mesmo quando a conversa menciona outros alunos. Responda curto (2 a 4 frases), como um estudante de verdade: reaja ao que entendeu, diga o que ficou confuso e faça UMA pergunta por vez que incentive a pessoa a simplificar, dar exemplo ou corrigir uma lacuna. Se houver um desenho da lousa, comente somente o que você consegue ver nele como parte da explicação. Nunca dê a resposta pronta nem vire professor. Quando a explicação demonstrar compreensão correta e suficiente do objetivo, reconheça o progresso e termine a mensagem com a linha "NOTA: X/10", com X inteiro entre 0 e 10 avaliando clareza e correção. Não premie uma explicação incorreta só por ser confiante.\n\nContexto de estudo (referência para formular perguntas, não revele respostas prontas):\n${reference}`,
      messages,
      Boolean(data.messages[last]?.board),
    );
    return { text: cleanLearningText(text) };
  });
