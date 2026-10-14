import { createOpenAI } from '@ai-sdk/openai';
import { streamText, Output, jsonSchema, NoObjectGeneratedError, type ModelMessage } from 'ai';
import { aiConfig, AiSetupError } from './ai-config';

const RUN = 'X-Lovable-AIG-Run-ID';

function provider() {
  const config = aiConfig(process.env);
  const key = config.key;
  let runId: string | undefined;
  const client = createOpenAI({
    baseURL: config.baseURL,
    apiKey: key,
    headers: config.lovable ? { 'Lovable-API-Key': key, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' } : {},
    fetch: async (input, init) => {
      const h = new Headers(init?.headers);
      if (config.lovable && runId && !h.has(RUN)) h.set(RUN, runId);
      const res = await fetch(input, { ...init, headers: h });
      runId ??= res.headers.get(RUN)?.trim() || undefined;
      if (!res.ok) {
        const msg = res.status === 401 || res.status === 403 ? 'A chave de IA foi recusada pelo provedor. Confira a chave configurada no servidor da hospedagem.' : res.status === 402 ? 'Os créditos de IA acabaram. Adicione créditos para continuar.' : res.status === 429 ? 'Muitos pedidos agora. Espere um pouco e tente de novo.' : null;
        if (msg) throw new AiSetupError(msg);
      }
      return res;
    },
  });
  return { model: config.mode === 'chat' ? client.chat(config.model) : client.responses(config.model), ...(config.lovable ? { providerOptions: options } : {}) };
}

const options = { openai: { forceReasoning: true, reasoningEffort: 'low', reasoningSummary: 'auto', store: false, include: ['reasoning.encrypted_content'] } } as const;

function friendly(e: unknown): never {
  const m = e instanceof Error ? e.message : '';
  if (e instanceof AiSetupError || /créditos|Muitos pedidos|chave de IA/.test(m)) throw new Error(m);
  // Do not log requests, prompts or provider credentials.
  console.error('[GStudy AI] Falha na geração:', e instanceof Error ? e.name : 'unknown');
  throw new Error('A IA não conseguiu responder agora. Tente de novo em instantes.');
}

export async function aiText(instructions: string, messages: ModelMessage[]) {
  try {
    const r = streamText({ ...provider(), instructions, messages });
    const text = (await r.text).trim();
    if (!text) throw new Error('empty');
    return text;
  } catch (e) { return friendly(e); }
}

export async function aiObject<T>(instructions: string, messages: ModelMessage[], schema: Record<string, unknown>): Promise<T> {
  try {
    const r = streamText({ ...provider(), instructions, messages, output: Output.object({ schema: jsonSchema<T>(schema as never) }) });
    return (await r.output) as T;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) throw new Error('A IA respondeu num formato inesperado. Tente gerar de novo.');
    return friendly(e);
  }
}
