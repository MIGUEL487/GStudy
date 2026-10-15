export class AiSetupError extends Error {}

export function aiConfig(env: Record<string, string | undefined>) {
  const customKey = env['AI_API_KEY']?.trim();
  if (customKey) {
    const baseURL = (env['AI_BASE_URL']?.trim() || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    const model = env['AI_MODEL']?.trim() || 'aion-labs/aion-2.0';
    const mode = env['AI_API_MODE']?.trim() || 'chat';
    if (!['chat', 'responses'].includes(mode)) throw new AiSetupError('AI_API_MODE precisa ser chat ou responses.');
    if (model === 'aion-labs/aion-2.0' && mode !== 'chat') throw new AiSetupError('O Aion 2.0 usa Chat Completions. Na Vercel, configure AI_API_MODE=chat.');
    try { if (new URL(baseURL).protocol !== 'https:') throw new Error(); }
    catch { throw new AiSetupError('AI_BASE_URL precisa ser uma URL HTTPS completa do provedor de IA.'); }
    if (/\/chat\/completions$|\/responses$/.test(baseURL)) throw new AiSetupError('AI_BASE_URL deve terminar na base da API, não em /chat/completions ou /responses.');
    return { key: customKey, baseURL, model, mode, lovable: false };
  }
  const key = env['LOVABLE_API_KEY']?.trim();
  if (!key) throw new AiSetupError('A IA não está configurada nesta hospedagem. Para usar Aion 2.0 na Vercel, salve a chave do OpenRouter em AI_API_KEY, somente no servidor, e faça Redeploy.');
  return { key, baseURL: 'https://ai.gateway.lovable.dev/v1', model: 'openai/gpt-6-astra', mode: 'responses', lovable: true };
}
