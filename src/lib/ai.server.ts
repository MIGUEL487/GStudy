import { createOpenAI } from '@ai-sdk/openai';
import { streamText, Output, jsonSchema, NoObjectGeneratedError, type ModelMessage } from 'ai';

const RUN = 'X-Lovable-AIG-Run-ID';
const MODEL = 'openai/gpt-6-astra';

function provider() {
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) throw new Error('A IA não está configurada.');
  let runId: string | undefined;
  return createOpenAI({
    baseURL: 'https://ai.gateway.lovable.dev/v1',
    apiKey: key,
    headers: { 'Lovable-API-Key': key, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' },
    fetch: async (input, init) => {
      const h = new Headers(init?.headers);
      if (runId && !h.has(RUN)) h.set(RUN, runId);
      const res = await fetch(input, { ...init, headers: h });
      runId ??= res.headers.get(RUN)?.trim() || undefined;
      if (!res.ok) {
        const msg = res.status === 402 ? 'Os créditos de IA acabaram. Adicione créditos para continuar.' : res.status === 429 ? 'Muitos pedidos agora. Espere um pouco e tente de novo.' : null;
        if (msg) throw new Error(msg);
      }
      return res;
    },
  });
}

const options = { openai: { forceReasoning: true, reasoningEffort: 'low', reasoningSummary: 'auto', store: false, include: ['reasoning.encrypted_content'] } } as const;

function friendly(e: unknown): never {
  const m = e instanceof Error ? e.message : '';
  if (/créditos|Muitos pedidos/.test(m)) throw new Error(m);
  console.error(e);
  throw new Error('A IA não conseguiu responder agora. Tente de novo em instantes.');
}

export async function aiText(instructions: string, messages: ModelMessage[]) {
  try {
    const r = streamText({ model: provider().responses(MODEL), instructions, messages, providerOptions: options });
    const text = (await r.text).trim();
    if (!text) throw new Error('empty');
    return text;
  } catch (e) { return friendly(e); }
}

export async function aiObject<T>(instructions: string, messages: ModelMessage[], schema: Record<string, unknown>): Promise<T> {
  try {
    const r = streamText({ model: provider().responses(MODEL), instructions, messages, providerOptions: options, output: Output.object({ schema: jsonSchema<T>(schema as never) }) });
    return (await r.output) as T;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) throw new Error('A IA respondeu num formato inesperado. Tente gerar de novo.');
    return friendly(e);
  }
}
