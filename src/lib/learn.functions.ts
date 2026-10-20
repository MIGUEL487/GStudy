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
} from "./learning-ai";
import { enforceServerAiQuota } from "./server-ai-quota";

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
});

export type Quiz = {
  questions: { question: string; options: string[]; answer: number; why: string }[];
};
export type Cards = { cards: { front: string; back: string }[] };
export type Explain = { topics: { title: string; explanation: string; example: string }[] };

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
    await enforceServerAiQuota(context.supabase, context.userId, data.mode);

    const { aiObject } = await import("./ai.server");
    const mem = await learningMemory(context.supabase, data.ids, !data.context);
    const msg: ModelMessage[] = [
      { role: "user" as const, content: learningReference(data.context, mem) },
    ];

    if (data.mode === "quiz") {
      const r = await aiObject<Quiz>(
        `${learningLanguage}\nCrie exatamente 6 perguntas de múltipla escolha sobre a etapa indicada. Cada uma deve ter exatamente 4 opções distintas e curtas, o índice (0 a 3) da única resposta correta e uma explicação curta e encorajadora. Verifique a resposta correta antes de entregar; nunca marque uma alternativa inconsistente. Varie a dificuldade da mais fácil à mais difícil e avalie compreensão, não pegadinhas.`,
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
      );
      return { mode: "quiz" as const, quiz: validatedLearningOutput(quizOutput, r) };
    }

    if (data.mode === "flashcards") {
      const r = await aiObject<Cards>(
        `${learningLanguage}\nCrie exatamente 10 flashcards sobre a etapa indicada. Frente: uma pergunta específica ou um termo curto. Verso: resposta clara em até 2 frases. Cada carta deve ensinar uma ideia distinta. Use somente texto legível, sem Markdown, asteriscos, crases, marcadores, HTML, símbolos de dólar ou comandos de LaTeX. Use acentuação natural e revise cada frente e verso para não haver palavras truncadas, duplicadas ou erros ortográficos. Fórmulas devem ser legíveis em texto simples, como c² = a² + b².`,
        msg,
        obj({ cards: arraySchema(obj({ front: s, back: s }), 10) }),
      );
      return { mode: "flashcards" as const, cards: validatedLearningOutput(cardsOutput, r) };
    }

    const r = await aiObject<Explain>(
      `${learningLanguage}\nExplique os 4 a 6 conceitos mais importantes desta etapa, como um ótimo professor: linguagem simples, conexão entre ideias e analogias do dia a dia. Para cada um: título, explicação (até 120 palavras, pode usar Markdown simples) e um exemplo prático. Prepare a pessoa para explicar o raciocínio e resolver um pequeno problema.`,
      msg,
      obj({ topics: arraySchema(obj({ title: s, explanation: s, example: s }), 4, 6) }),
    );
    return { mode: "explain" as const, explain: validatedLearningOutput(explainOutput, r) };
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
