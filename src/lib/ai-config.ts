export class AiSetupError extends Error {}

export function aiConfig(env: Record<string, string | undefined>) {
  const customKey = env['AI_API_KEY']?.trim();
  if (customKey) {
    const baseURL = env['AI_BASE_URL']?.trim();
    const model = env['AI_MODEL']?.trim();
    const mode = env['AI_API_MODE']?.trim() || 'chat';
    if (!baseURL || !model) throw new AiSetupError('A IA está incompleta na hospedagem. Configure AI_BASE_URL e AI_MODEL junto com AI_API_KEY.');
    if (!['chat', 'responses'].includes(mode)) throw new AiSetupError('AI_API_MODE precisa ser chat ou responses.');
    try { if (new URL(baseURL).protocol !== 'https:') throw new Error(); }
    catch { throw new AiSetupError('AI_BASE_URL precisa ser uma URL HTTPS completa do provedor de IA.'); }
    return { key: customKey, baseURL, model, mode, lovable: false };
  }
  const key = env['LOVABLE_API_KEY']?.trim();
  if (!key) throw new AiSetupError('A IA não está configurada nesta hospedagem. Configure LOVABLE_API_KEY no servidor, ou AI_API_KEY, AI_BASE_URL e AI_MODEL para outro provedor.');
  return { key, baseURL: 'https://ai.gateway.lovable.dev/v1', model: 'openai/gpt-6-astra', mode: 'responses', lovable: true };
}
