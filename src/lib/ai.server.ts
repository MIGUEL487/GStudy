import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, Output, jsonSchema, NoObjectGeneratedError, type ModelMessage } from 'ai';
import { aiConfig, AiSetupError } from './ai-config';
import { providerFailure, safeAiFailure } from './ai-errors';

function provider(whiteboard = false) {
  const config = aiConfig(process.env);
  const providerFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (!response.ok) {
      const payload: unknown = await response.clone().json().catch(() => null);
      throw providerFailure(response.status, payload, { whiteboard, google: true });
    }
    return response;
  };
  const google = createGoogleGenerativeAI({
    apiKey: config.key, baseURL: config.baseURL, fetch: providerFetch,
  });
  return { model: google(config.model) };
}

function friendly(error: unknown, whiteboard = false): never {
  const failure = safeAiFailure(error, { whiteboard, google: true });
  // Record only safe fields, never SDK errors (which can contain request bodies).
  console.error('[GStudy AI] Falha na geração:', { whiteboard, google: true, status: failure.status ?? null });
  throw new Error(failure.message);
}

export async function aiText(instructions: string, messages: ModelMessage[], whiteboard = false) {
  try {
    const r = await generateText({ ...provider(whiteboard), system: instructions, messages, maxRetries: 0 });
    const text = r.text.trim();
    if (!text) throw new AiSetupError(r.finishReason === 'length' ? 'A IA atingiu o limite de geração antes de concluir a resposta. Tente uma explicação ou um desenho menor.' : 'O provedor de IA não retornou uma resposta de texto. Tente novamente ou confira se o modelo escolhido gera texto.');
    return text;
  } catch (e) { return friendly(e, whiteboard); }
}

export async function aiObject<T>(instructions: string, messages: ModelMessage[], schema: Record<string, unknown>): Promise<T> {
  try {
    const r = await generateText({ ...provider(), system: instructions, messages, maxRetries: 0, output: Output.object({ schema: jsonSchema<T>(schema as never) }) });
    return r.output as T;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) throw new Error('A IA respondeu num formato inesperado. Tente gerar de novo.');
    return friendly(e);
  }
}
