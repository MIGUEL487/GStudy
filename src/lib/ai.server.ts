import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import {
  generateText,
  Output,
  jsonSchema,
  NoObjectGeneratedError,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { aiConfig, AiSetupError, groqConfig } from "./ai-config";
import { canFallback, providerFailure, safeAiFailure } from "./ai-errors";
import { groqMessages, hasImages } from "./ai-fallback-media.server";

type Provider = "gemini" | "groq";
const groqTimeoutMs = 25000;
async function provider(name: Provider, vision: boolean, research = false) {
  const context = { whiteboard: vision, google: name === "gemini", groq: name === "groq" };
  const providerFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (!response.ok) {
      const payload: unknown = await response
        .clone()
        .json()
        .catch(() => null);
      const failure = providerFailure(response.status, payload, context);
      const message = (payload as { error?: { message?: unknown } } | null)?.error?.message;
      if (
        research &&
        response.status === 400 &&
        typeof message === "string" &&
        /(?:google.?search|grounding|search tool).*(?:not supported|unsupported|not enabled|unavailable)|(?:not supported|unsupported).*(?:google.?search|grounding|search tool)/i.test(
          message,
        )
      )
        Object.assign(failure, { searchUnavailable: true });
      throw failure;
    }
    return response;
  };
  if (name === "gemini") {
    const config = aiConfig(process.env);
    const google = createGoogleGenerativeAI({
      apiKey: config.key,
      baseURL: config.baseURL,
      fetch: providerFetch,
    });
    return google(config.model);
  }
  const config = groqConfig(process.env);
  if (!config)
    throw new AiSetupError(
      "O Gemini não respondeu e a alternativa Groq ainda não foi configurada. Adicione GROQ_API_KEY nas variáveis de Production e publique novamente.",
    );
  const { createGroq } = await import("@ai-sdk/groq");
  const groq = createGroq({ apiKey: config.key, baseURL: config.baseURL, fetch: providerFetch });
  return groq(vision ? config.visionModel : config.model);
}
function logFailure(error: unknown, name: Provider, vision: boolean) {
  const failure = safeAiFailure(error, {
    whiteboard: vision,
    google: name === "gemini",
    groq: name === "groq",
  });
  // SDK exceptions may contain keys, photos, notes or request bodies. Log only safe fields.
  console.error("[GStudy AI] Falha na geração:", {
    provider: name,
    vision,
    status: failure.status ?? null,
  });
  return failure;
}
function finishFailure(error: unknown, name: Provider, vision: boolean): never {
  const failure = logFailure(error, name, vision);
  if (NoObjectGeneratedError.isInstance(error))
    throw new Error("A IA respondeu num formato inesperado. Tente gerar de novo.");
  throw new Error(failure.message);
}
async function generate(
  instructions: string,
  messages: ModelMessage[],
  name: Provider,
  schema?: Record<string, unknown>,
  research = false,
): Promise<unknown> {
  const model = await provider(name, hasImages(messages), research);
  const request = () =>
    generateText({
      model,
      system:
        name === "groq" && schema
          ? `${instructions}\n\nResponda somente com um objeto JSON válido que cumpra este esquema, sem cercas de código e sem texto fora do JSON:\n${JSON.stringify(schema)}`
          : instructions,
      messages,
      maxRetries: 0,
      ...(research && name === "gemini"
        ? { tools: { google_search: google.tools.googleSearch({}) } as unknown as ToolSet }
        : {}),
      // Do not interrupt a healthy Gemini generation just to switch providers.
      ...(schema ? { output: Output.object({ schema: jsonSchema(schema as never) }) } : {}),
      // Llama text/vision models support JSON mode, but not all support strict JSON Schema.
      ...(name === "groq"
        ? {
            abortSignal: AbortSignal.timeout(groqTimeoutMs),
            providerOptions: { groq: { structuredOutputs: false } },
          }
        : {}),
    });
  let result;
  try {
    result = await request();
  } catch (error) {
    if (
      research &&
      name === "gemini" &&
      (error as { searchUnavailable?: boolean })?.searchUnavailable
    ) {
      const text = await generate(
        instructions +
          "\nA pesquisa web está indisponível. Não afirme ter consultado fontes nem confirmado o edital atual.",
        messages,
        name,
      );
      return { text: text as string, sources: [] };
    }
    throw error;
  }
  if (result.finishReason === "content-filter")
    throw Object.assign(new Error("Filtered"), { finishReason: "content-filter" });
  if (result.finishReason === "length")
    throw new AiSetupError(
      "A IA atingiu o limite de geração antes de concluir a resposta. Tente um conteúdo menor.",
    );
  if (schema) {
    const output = result.output;
    if (!output || typeof output !== "object" || Array.isArray(output))
      throw new AiSetupError("A IA respondeu num formato incompleto. Tente gerar de novo.");
    return output;
  }
  const text = result.text.trim();
  if (!text)
    throw new AiSetupError(
      "O provedor de IA não retornou uma resposta de texto. Tente novamente ou confira se o modelo escolhido gera texto.",
    );
  if (research) {
    const sources = result.sources.flatMap((source) =>
      source.sourceType === "url"
        ? [{ title: source.title || "Fonte consultada", url: source.url }]
        : [],
    );
    return { text, sources };
  }
  return text;
}
async function withFallback(
  instructions: string,
  messages: ModelMessage[],
  whiteboard: boolean,
  schema?: Record<string, unknown>,
  research = false,
) {
  const vision = whiteboard || hasImages(messages);
  try {
    return {
      value: await generate(instructions, messages, "gemini", schema, research),
      convertedPdf: false,
    };
  } catch (error) {
    if (!canFallback(error)) return finishFailure(error, "gemini", vision);
    if (!process.env["GROQ_API_KEY"]?.trim()) return finishFailure(error, "gemini", vision);
    logFailure(error, "gemini", vision);
  }
  try {
    const fallback = await groqMessages(messages);
    const extra = fallback.convertedPdf
      ? "\nVocê recebeu apenas texto extraído do PDF; não interprete nem invente ilustrações, diagramas ou imagens ausentes."
      : "";
    const value = await generate(
      instructions +
        extra +
        (research
          ? "\nVocê não tem busca web nesta resposta. Não afirme ter consultado páginas nem confirmado o edital atual."
          : ""),
      fallback.messages,
      "groq",
      schema,
      research,
    );
    return { value, convertedPdf: fallback.convertedPdf };
  } catch (error) {
    const failure = logFailure(error, "groq", vision);
    if (NoObjectGeneratedError.isInstance(error))
      throw new Error(
        "O Gemini não respondeu e o Groq retornou um formato inesperado. Tente novamente.",
      );
    throw new Error(`O Gemini não respondeu. ${failure.message}`);
  }
}
export async function aiText(instructions: string, messages: ModelMessage[], whiteboard = false) {
  const result = await withFallback(instructions, messages, whiteboard);
  return `${result.convertedPdf ? "Leitura alternativa do PDF: apenas o texto foi analisado; ilustrações não foram interpretadas.\n\n" : ""}${result.value as string}`;
}
export async function aiObject<T>(
  instructions: string,
  messages: ModelMessage[],
  schema: Record<string, unknown>,
): Promise<T> {
  return (await withFallback(instructions, messages, false, schema)).value as T;
}

// Source URLs come from provider grounding metadata, never from prose.
export async function aiResearch(instructions: string, messages: ModelMessage[]) {
  return (await withFallback(instructions, messages, false, undefined, true)).value as {
    text: string;
    sources: { title: string; url: string }[];
  };
}
