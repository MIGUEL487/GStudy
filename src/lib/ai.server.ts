import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, Output, jsonSchema, NoObjectGeneratedError, type ModelMessage } from 'ai';
import { aiConfig, boardAiConfig, AiSetupError } from './ai-config';

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
        const keyName = whiteboard ? 'BOARD_AI_API_KEY' : config.lovable ? 'LOVABLE_API_KEY' : 'AI_API_KEY';
        const msg = res.status === 401 ? `A chave de IA foi recusada. Confira ${keyName} na hospedagem e publique novamente.` : res.status === 403 ? 'O provedor bloqueou o acesso à IA. Confira as permissões da conta antes de tentar novamente.' : res.status === 402 ? 'Os créditos de IA acabaram. Adicione créditos no provedor para continuar.' : res.status === 429 ? 'Muitos pedidos agora. Espere um pouco e tente de novo.' : res.status === 404 ? `O modelo ou endereço da IA não está disponível. Confira ${whiteboard ? 'BOARD_AI_MODEL e BOARD_AI_BASE_URL' : 'AI_MODEL e AI_BASE_URL'} na hospedagem.` : null;
        if (msg) throw new AiSetupError(msg);
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

function friendly(e: unknown): never {
  const m = e instanceof Error ? e.message : '';
  if (e instanceof AiSetupError || /créditos|Muitos pedidos|chave de IA/.test(m)) throw new Error(m);
  // Do not log requests, prompts or provider credentials.
  console.error('[GStudy AI] Falha na geração:', e instanceof Error ? e.name : 'unknown');
  throw new Error('A IA não conseguiu responder agora. Tente de novo em instantes.');
}

export async function aiText(instructions: string, messages: ModelMessage[], whiteboard = false) {
  try {
    const r = streamText({ ...provider(messages, whiteboard), system: instructions, messages, maxRetries: 0 });
    const text = (await r.text).trim();
    if (!text) throw new Error('empty');
    return text;
  } catch (e) { return friendly(e); }
}

export async function aiObject<T>(instructions: string, messages: ModelMessage[], schema: Record<string, unknown>): Promise<T> {
  try {
    const r = streamText({ ...provider(messages), system: instructions, messages, maxRetries: 0, output: Output.object({ schema: jsonSchema<T>(schema as never) }) });
    return (await r.output) as T;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) throw new Error('A IA respondeu num formato inesperado. Tente gerar de novo.');
    return friendly(e);
  }
}
