import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import {
  generateText,
  Output,
  jsonSchema,
  NoObjectGeneratedError,
  type ModelMessage,
  type ToolSet,
} from "ai";
import {
  aiConfig,
  AiSetupError,
  groqConfig,
  openRouterConfig,
  socratesAiConfig,
} from "./ai-config";
import { canFallback, providerFailure, safeAiFailure } from "./ai-errors";
import { fallbackMessages, hasImages } from "./ai-fallback-media.server";
import { hasPdf, validateOpenRouterFiles } from "./openrouter-media.server";

type Provider = "gemini" | "socrates-gemini" | "groq" | "openrouter" | "omniroute" | "deepseek";
const groqTimeoutMs = 25000;

export function cleanSchemaForGemini(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(cleanSchemaForGemini);
  if (val && typeof val === "object") {
    const raw = val as Record<string, unknown>;
    if (Array.isArray(raw["anyOf"]) && raw["anyOf"].length === 2) {
      const hasNull = raw["anyOf"].some(
        (s) => s && typeof s === "object" && (s as Record<string, unknown>)["type"] === "null",
      );
      const real = raw["anyOf"].find(
        (s) => s && typeof s === "object" && (s as Record<string, unknown>)["type"] !== "null",
      );
      if (hasNull && real && typeof real === "object") {
        return cleanSchemaForGemini({ ...(real as Record<string, unknown>), nullable: true });
      }
    }
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === "additionalProperties" || k === "$schema" || k === "$ref" || k === "format") {
        continue;
      }
      copy[k] = cleanSchemaForGemini(v);
    }
    return copy;
  }
  return val;
}

export function cleanMessages(messages: ModelMessage[]): ModelMessage[] {
  const cleaned: ModelMessage[] = [];
  for (const msg of messages) {
    if (!msg || !msg.role) continue;
    if (typeof msg.content === "string") {
      const text = msg.content.trim();
      if (!text) continue;
      cleaned.push({ ...msg, content: text });
    } else if (Array.isArray(msg.content)) {
      const filteredParts = msg.content.filter((part) => {
        if (!part) return false;
        if (part.type === "text")
          return typeof part.text === "string" && part.text.trim().length > 0;
        return true;
      });
      if (filteredParts.length > 0) {
        cleaned.push({ ...msg, content: filteredParts as unknown as ModelMessage["content"] });
      }
    } else if (msg.content) {
      cleaned.push(msg);
    }
  }

  if (cleaned.length === 0) {
    return [{ role: "user", content: "Continuar" }];
  }

  const last = cleaned[cleaned.length - 1];
  if (last.role === "assistant") {
    cleaned.push({ role: "user", content: "Por favor, continue." });
  }

  return cleaned;
}

type GenerationMeter = { maxOutputTokens: number; onUsage: (total: number | undefined) => void };
async function provider(name: Provider, vision: boolean, research = false, document = false) {
  const context = {
    whiteboard: vision,
    google: name === "gemini" || name === "socrates-gemini",
    groq: name === "groq",
    openrouter: name === "openrouter",
    omniroute: name === "omniroute",
    deepseek: name === "deepseek",
    ...(name === "omniroute" || name === "deepseek" || name === "socrates-gemini"
      ? { keyVariable: "SOCRATES_AI_API_KEY" }
      : {}),
    document,
  };
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
  if (name === "socrates-gemini") {
    const config = socratesAiConfig(process.env);
    if (!config)
      throw new AiSetupError(
        "Configure SOCRATES_AI_API_KEY para ativar a IA exclusiva do Sócrates.",
      );
    const google = createGoogleGenerativeAI({
      apiKey: config.key,
      baseURL: config.baseURL,
      fetch: providerFetch,
    });
    return google(config.model);
  }
  if (name === "omniroute" || name === "deepseek") {
    const config = socratesAiConfig(process.env);
    if (!config)
      throw new AiSetupError(
        "Configure SOCRATES_AI_API_KEY para ativar a IA exclusiva do Sócrates.",
      );
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const dedicated = createOpenAICompatible({
      name,
      apiKey: config.key,
      baseURL: config.baseURL,
      fetch: providerFetch,
      supportsStructuredOutputs: false,
    });
    return dedicated.chatModel(config.model);
  }
  if (name === "openrouter") {
    const config = openRouterConfig(process.env);
    if (!config)
      throw new AiSetupError("Configure OPENROUTER_API_KEY na Vercel para ativar a terceira IA.");
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const openrouter = createOpenAICompatible({
      name: "openrouter",
      apiKey: config.key,
      baseURL: config.baseURL,
      fetch: providerFetch,
      supportsStructuredOutputs: false,
      // Fixed zero-price routing and an explicitly free parser prevent paid defaults.
      transformRequestBody: (body) => ({
        ...body,
        provider: { max_price: { prompt: 0, completion: 0 } },
        ...(document ? { plugins: [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }] } : {}),
      }),
    });
    return openrouter.chatModel(vision ? config.visionModel : config.model);
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
    google: name === "gemini" || name === "socrates-gemini",
    groq: name === "groq",
    openrouter: name === "openrouter",
    omniroute: name === "omniroute",
    deepseek: name === "deepseek",
    ...(name === "omniroute" || name === "deepseek" || name === "socrates-gemini"
      ? { keyVariable: "SOCRATES_AI_API_KEY" }
      : {}),
  });
  // SDK exceptions may contain keys, photos, notes or request bodies. Log only safe fields.
  const isGoogle = name === "gemini" || name === "socrates-gemini";
  console.error("[GStudy AI] Falha na geração:", {
    provider: name,
    vision,
    status: failure.status ?? null,
    category: failure.category ?? null,
    ...(isGoogle && failure.providerMessage
      ? { googleStatus: failure.status, googleMessage: failure.providerMessage }
      : {}),
  });
  return failure;
}
function finishFailure(error: unknown, name: Provider, vision: boolean): never {
  const failure = logFailure(error, name, vision);
  if (NoObjectGeneratedError.isInstance(error))
    throw new Error("A IA respondeu num formato inesperado. Tente gerar de novo.");
  let displayMessage = failure.message;
  if (process.env["DEBUG_AI_ERRORS"] === "1" && failure.providerMessage) {
    displayMessage += ` (Google ${failure.status}: ${failure.providerMessage})`;
  }
  throw new Error(displayMessage);
}
async function generate(
  instructions: string,
  messages: ModelMessage[],
  name: Provider,
  schema?: Record<string, unknown>,
  research = false,
  meter?: GenerationMeter,
): Promise<unknown> {
  if (name === "openrouter") await validateOpenRouterFiles(messages);
  const model = await provider(name, hasImages(messages), research, hasPdf(messages));
  const isGoogle = name === "gemini" || name === "socrates-gemini";
  const validMessages = isGoogle ? cleanMessages(messages) : messages;
  const request = () =>
    generateText({
      model,
      system:
        !isGoogle && schema
          ? `${instructions}\n\nResponda somente com um objeto JSON válido que cumpra este esquema, sem cercas de código e sem texto fora do JSON:\n${JSON.stringify(schema)}`
          : instructions,
      messages: validMessages,
      maxRetries: 0,
      ...(meter ? { maxOutputTokens: meter.maxOutputTokens } : {}),
      abortSignal: AbortSignal.timeout(
        name === "groq"
          ? groqTimeoutMs
          : name === "gemini" || name === "socrates-gemini"
            ? 35000
            : 45000,
      ),
      ...(research && isGoogle && !schema
        ? { tools: { google_search: google.tools.googleSearch({}) } as unknown as ToolSet }
        : {}),
      providerOptions: {
        ...(name === "groq" ? { groq: { structuredOutputs: false } } : {}),
      },
      // Do not interrupt a healthy Gemini generation just to switch providers.
      ...(schema
        ? {
            output: Output.object({
              schema: jsonSchema(
                (isGoogle ? cleanSchemaForGemini(schema) : schema) as Parameters<
                  typeof jsonSchema
                >[0],
              ),
            }),
          }
        : {}),
    });
  let result;
  try {
    result = await request();
  } catch (error) {
    if (research && isGoogle && (error as { searchUnavailable?: boolean })?.searchUnavailable) {
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
  meter?.onUsage(result.usage.totalTokens);
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
    const sources = isGoogle
      ? result.sources.flatMap((source) =>
          source.sourceType === "url"
            ? [{ title: source.title || "Fonte consultada", url: source.url }]
            : [],
        )
      : [];
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
  meter?: GenerationMeter,
  socrates = false,
) {
  const vision = whiteboard || hasImages(messages);
  const socratesConfig =
    socrates && process.env["SOCRATES_AI_API_KEY"]?.trim() ? socratesAiConfig(process.env) : null;
  const socratesProvider: Provider | null = socratesConfig
    ? socratesConfig.provider === "gemini"
      ? "socrates-gemini"
      : !vision
        ? (socratesConfig.provider as Provider)
        : null
    : null;

  const providers: Provider[] = [
    ...(socratesProvider ? [socratesProvider] : []),
    "gemini",
    ...(process.env["GROQ_API_KEY"]?.trim() ? ["groq" as const] : []),
    ...(process.env["OPENROUTER_API_KEY"]?.trim() ? ["openrouter" as const] : []),
  ];
  const labels: Record<Provider, string> = {
    gemini: "Gemini",
    "socrates-gemini": "Sócrates (Gemini)",
    groq: "Groq",
    openrouter: "OpenRouter",
    omniroute: "OmniRoute",
    deepseek: "DeepSeek",
  };

  const runProvider = async (name: Provider) => {
    const prepared =
      name === "groq" || name === "deepseek" || name === "omniroute"
        ? await fallbackMessages(messages)
        : { messages, convertedPdf: false };
    const parsedPdf = name === "openrouter" && hasPdf(messages);
    const extra =
      prepared.convertedPdf || parsedPdf
        ? "\nVocê recebeu apenas texto extraído do PDF; não interprete nem invente ilustrações, diagramas ou imagens ausentes."
        : "";
    const isGoogle = name === "gemini" || name === "socrates-gemini";
    const noSearch =
      !isGoogle && research
        ? "\nVocê não tem busca web nesta resposta. Não afirme ter consultado páginas nem confirmado o edital atual."
        : "";
    const value = await generate(
      instructions + extra + noSearch,
      prepared.messages,
      name,
      schema,
      research,
      meter,
    );
    return { value, convertedPdf: prepared.convertedPdf || parsedPdf };
  };

  const failed: string[] = [];
  for (const [index, name] of providers.entries()) {
    try {
      return await runProvider(name);
    } catch (error) {
      if (index < providers.length - 1 && canFallback(error)) {
        logFailure(error, name, vision);
        failed.push(labels[name]);
        continue;
      }
      if (!failed.length) return finishFailure(error, name, vision);
      const failure = logFailure(error, name, vision);
      const prefix =
        failed.length === 1
          ? "O " + failed[0] + " não respondeu. "
          : failed.join(" e ") + " não responderam. ";
      if (NoObjectGeneratedError.isInstance(error))
        throw new Error(
          prefix + labels[name] + " retornou um formato inesperado. Tente novamente.",
        );
      let screenMessage = prefix + failure.message;
      if (process.env["DEBUG_AI_ERRORS"] === "1" && failure.providerMessage) {
        screenMessage += ` (Google ${failure.status}: ${failure.providerMessage})`;
      }
      throw new Error(screenMessage);
    }
  }
  throw new Error("Nenhum provedor de IA está disponível.");
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

/** Only the Socrates endpoint opts into metering; other study requests keep their settings. */
export async function aiMeteredObject(
  instructions: string,
  messages: ModelMessage[],
  schema: Record<string, unknown>,
  maxOutputTokens: number,
) {
  // A partially configured dedicated provider is a setup error, not a silent
  // switch to the site's shared credential.
  if (process.env["SOCRATES_AI_API_KEY"]?.trim()) socratesAiConfig(process.env);
  let totalTokens: number | undefined;
  const result = await withFallback(
    instructions,
    messages,
    false,
    schema,
    false,
    {
      maxOutputTokens,
      onUsage: (total) => {
        totalTokens = total;
      },
    },
    true,
  );
  return { value: result.value, totalTokens };
}

// Source URLs come from provider grounding metadata, never from prose.
export async function aiResearch(instructions: string, messages: ModelMessage[]) {
  return (await withFallback(instructions, messages, false, undefined, true)).value as {
    text: string;
    sources: { title: string; url: string }[];
  };
}
