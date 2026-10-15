import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, Output, jsonSchema, NoObjectGeneratedError, type ModelMessage } from 'ai';
import { aiConfig, boardAiConfig, AiSetupError } from './ai-config';
import { providerFailure, safeAiFailure } from './ai-errors';

const RUN = 'X-Lovable-AIG-Run-ID';

function provider(messages: ModelMessage[], whiteboard = false) {
  const config = whiteboard ? boardAiConfig(process.env) : aiConfig(process.env);
  if (config.model === 'aion-labs/aion-2.0' && messages.some(m => Array.isArray(m.content) && m.content.some(p => p.type === 'image' || p.type === 'file'))) {
    throw new AiSetupError('O Aion 2.0 aceita apenas texto. Cole o conteúdo como resumo ou importe o texto do Notion; imagens, PDFs e desenhos da lousa não podem ser interpretados por esse modelo.');
  }
  const key = config.key;
  let runId: string | undefined;
  const providerFetch: typeof fetch = async (input, init) => {
      const h = new Headers(init?.headers);
      if (config.lovable && runId && !h.has(RUN)) h.set(RUN, runId);
      const res = await fetch(input, { ...init, headers: h });
      runId ??= res.headers.get(RUN)?.trim() || undefined;
      if (!res.ok) {
        const payload: unknown = await res.clone().json().catch(() => null);
        throw providerFailure(res.status, payload, { whiteboard, google: new URL(config.baseURL).hostname === 'generativelanguage.googleapis.com', lovable: config.lovable });
      }
      return res;
    };
  if (config.mode === 'chat') {
    const client = createOpenAICompatible({ name: 'study', baseURL: config.baseURL, headers: { Authorization: `Bearer ${key}` }, supportsStructuredOutputs: true, fetch: providerFetch });
    return { model: client.chatModel(config.model) };
  }
  const client = createOpenAI({ baseURL: config.baseURL, apiKey: key, headers: config.lovable ? { 'Lovable-API-Key': key, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' } : {}, fetch: providerFetch });
  return { model: client.responses(config.model), ...(config.lovable ? { providerOptions: options } : {}) };
}

const options = { openai: { forceReasoning: true, reasoningEffort: 'low', reasoningSummary: 'auto', store: false, include: ['reasoning.encrypted_content'] } } as const;

function friendly(error: unknown, whiteboard = false): never {
  const baseURL = whiteboard ? process.env['BOARD_AI_BASE_URL'] : process.env['AI_BASE_URL'];
  let google = false;
  try { google = new URL(baseURL || '').hostname === 'generativelanguage.googleapis.com'; } catch { /* invalid config is reported separately */ }
  const failure = safeAiFailure(error, { whiteboard, google, lovable: !whiteboard && !process.env['AI_API_KEY']?.trim() });
  // Record only safe fields, never SDK errors (which can contain request bodies).
  console.error('[GStudy AI] Falha na geração:', { whiteboard, google, status: failure.status ?? null });
  throw new Error(failure.message);
}

export async function aiText(instructions: string, messages: ModelMessage[], whiteboard = false) {
  try {
    const r = await generateText({ ...provider(messages, whiteboard), system: instructions, messages, maxRetries: 0 });
    const text = r.text.trim();
    if (!text) throw new AiSetupError(r.finishReason === 'length' ? 'A IA atingiu o limite de geração antes de concluir a resposta. Tente uma explicação ou um desenho menor.' : 'O provedor de IA não retornou uma resposta de texto. Tente novamente ou confira se o modelo escolhido gera texto.');
    return text;
  } catch (e) { return friendly(e, whiteboard); }
}

export async function aiObject<T>(instructions: string, messages: ModelMessage[], schema: Record<string, unknown>): Promise<T> {
  try {
    const r = await generateText({ ...provider(messages), system: instructions, messages, maxRetries: 0, output: Output.object({ schema: jsonSchema<T>(schema as never) }) });
    return r.output as T;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) throw new Error('A IA respondeu num formato inesperado. Tente gerar de novo.');
    return friendly(e);
  }
}
