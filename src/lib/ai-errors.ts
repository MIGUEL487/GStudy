import { AiSetupError } from './ai-config';

type Context = { whiteboard: boolean; google: boolean };
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;

// Read provider diagnostics only to classify them. Never return raw response text,
// URLs, prompts, project identifiers, request bodies or credentials to the client.
export function providerFailure(status: number, payload: unknown, context: Context): AiSetupError {
  const failure = (message: string) => Object.assign(new AiSetupError(message), { statusCode: status });
  const root = record(Array.isArray(payload) ? payload[0] : payload);
  const error = record(root?.['error']);
  const message = typeof error?.['message'] === 'string' ? error['message'] : '';
  const details = Array.isArray(error?.['details']) ? error['details'] : [];
  const reasons = details.map(value => record(value)?.['reason']);
  const key = 'BOARD_AI_API_KEY';
  const model = 'BOARD_AI_MODEL';
  const url = 'BOARD_AI_BASE_URL';
  const provider = context.google ? 'O Gemini' : 'O provedor de IA';
  if (reasons.some(reason => ['API_KEY_INVALID', 'API_KEY_EXPIRED', 'API_KEY_NOT_FOUND'].includes(String(reason))) || status === 401) {
    return failure(`A chave de IA foi recusada (HTTP ${status}). Confira ${key} nas variáveis de Production da hospedagem e publique novamente.`);
  }
  if (context.google && status === 404 && /no longer available|new users|deprecated|retired/i.test(message)) {
    return failure(`O Google não disponibiliza mais esse modelo para sua conta (HTTP 404). Atualize ${model} para um modelo ativo no Google AI Studio e publique novamente.`);
  }
  if (status === 403) return failure(`${provider} bloqueou o acesso (HTTP 403). Confira as permissões e restrições da chave ${key} para chamadas pelo servidor.`);
  if (status === 402) return failure('Os créditos de IA acabaram (HTTP 402). Confira o saldo no provedor.');
  if (status === 429) return failure(`${provider} atingiu o limite de requisições ou a cota do projeto (HTTP 429). Confira a cota desse modelo no provedor e aguarde a renovação do limite.`);
  if (status === 404) return failure(`O modelo ou endereço da IA não está disponível (HTTP 404). Confira ${model} e ${url} na hospedagem.`);
  if (status === 400 || status === 422) return failure(`${provider} recusou ${context.whiteboard ? 'a imagem' : 'o conteúdo'} ou os parâmetros enviados (HTTP ${status}). Confira a configuração do modelo e tente um conteúdo menor.`);
  if (status >= 500) return failure(`${provider} está temporariamente indisponível (HTTP ${status}). Aguarde alguns instantes e tente novamente.`);
  return failure(`${provider} recusou a solicitação (HTTP ${status}). Confira a configuração do serviço na hospedagem.`);
}

export function safeAiFailure(error: unknown, context: Context): { message: string; status: number | undefined } {
  const seen = new Set<unknown>(); let current = error;
  let status: number | undefined;
  for (let depth = 0; depth < 8 && current && !seen.has(current); depth++) {
    seen.add(current);
    const item = record(current);
    if (typeof item?.['statusCode'] === 'number') status = item['statusCode'];
    if (current instanceof AiSetupError) return { message: current.message, status };
    if (['AbortError', 'TimeoutError'].includes(String(item?.['name']))) return { message: 'A IA demorou demais para responder. Tente novamente com um desenho ou uma mensagem menor.', status };
    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(String(item?.['code']))) return { message: 'Não foi possível conectar ao provedor de IA. Tente novamente em instantes.', status };
    current = item?.['cause'];
  }
  if (status !== undefined && status >= 400 && status < 600) return { message: providerFailure(status, null, context).message, status };
  return { message: 'A IA não conseguiu responder agora. Tente de novo em instantes.', status };
}
