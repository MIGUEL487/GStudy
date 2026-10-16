import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiText, aiObject } from '@/lib/ai.server';
import { providerFailure, safeAiFailure } from '@/lib/ai-errors';
import { AiSetupError } from '@/lib/ai-config';

const fetchMock = vi.fn();
const context = { whiteboard: true, google: true };
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const messages = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Qual a cor?' }, { type: 'image' as const, image }] }];
const success = (text = 'Vermelho', finish = 'STOP') => new Response(JSON.stringify({ candidates: [{ index: 0, content: { role: 'model', parts: [{ text }] }, finishReason: finish }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 }, modelVersion: 'gemini-3.5-flash-lite' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  vi.stubEnv("GROK_API_KEY", ""); vi.stubEnv("XAI_API_KEY", "");
  vi.stubEnv('GROQ_API_KEY', '');
  vi.stubEnv('BOARD_AI_API_KEY', 'secret-test-key');
  vi.stubEnv('BOARD_AI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai');
  vi.stubEnv('BOARD_AI_MODEL', 'gemini-3.5-flash-lite');
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); fetchMock.mockReset(); });
describe('Resposta real do SDK de IA com HTTP simulado', () => {
  it('envia a imagem pela API nativa e retorna a resposta sem depender de streaming', async () => {
    fetchMock.mockResolvedValue(success());
    await expect(aiText('Observe a imagem.', messages, true)).resolves.toBe('Vermelho');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    const request = JSON.parse(init.body as string);
    expect(request.contents.at(-1).parts).toContainEqual(expect.objectContaining({ inlineData: expect.objectContaining({ mimeType: 'image/png' }) }));
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('secret-test-key');
  });
  it('envia PDFs como inlineData nativo, sem o formato incompatível de Chat Completions', async () => {
    fetchMock.mockResolvedValue(success('Um resumo do documento.'));
    await expect(aiText('Leia o arquivo.', [{ role: 'user', content: [{ type: 'file', data: 'data:application/pdf;base64,JVBERi0xLjQK', mediaType: 'application/pdf' }] }])).resolves.toBe('Um resumo do documento.');
    const request = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(request.contents[0].parts).toContainEqual({ inlineData: { mimeType: 'application/pdf', data: 'JVBERi0xLjQK' } });
  });
  it('mantém as saídas estruturadas das atividades pelo SDK nativo', async () => {
    fetchMock.mockResolvedValue(success('{"answer":"Água"}'));
    await expect(aiObject('Responda em JSON.', [{ role: 'user', content: 'Qual o nome de H₂O?' }], { type: 'object', additionalProperties: false, properties: { answer: { type: 'string' } }, required: ['answer'] })).resolves.toEqual({ answer: 'Água' });
    const request = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(request.generationConfig.responseMimeType).toBe('application/json');
  });
  it('preserva o erro de modelo removido mesmo quando o SDK encapsula a falha do fetch', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ error: { code: 404, message: 'This model is no longer available to new users. secret-test-key', status: 'NOT_FOUND' } }]), { status: 404 }));
    await expect(aiText('Observe.', messages, true)).rejects.toThrow('não disponibiliza mais esse modelo');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret-test-key');
  });
  it.each([400, 401, 403, 429, 503])('informa HTTP %i em vez de ocultar o erro do provedor', async status => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'private prompt secret-test-key' } }), { status }));
    await expect(aiText('Observe.', messages, true)).rejects.toThrow(`HTTP ${status}`);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private prompt');
  });
  it('distingue uma resposta vazia por limite de geração de uma falha genérica', async () => {
    fetchMock.mockResolvedValue(success('', 'MAX_TOKENS'));
    await expect(aiText('Observe.', messages, true)).rejects.toThrow('limite de geração');
  });
});
describe('Mensagens sem dados sensíveis', () => {
  it('identifica chave inválida no formato de erro do Google', () => {
    const error = providerFailure(400, [{ error: { message: 'do not expose this', details: [{ reason: 'API_KEY_INVALID' }] } }], context);
    expect(error.message).toContain('BOARD_AI_API_KEY'); expect(error.message).not.toContain('do not expose this');
  });
  it('encontra o erro seguro dentro de causas encadeadas', () => {
    const error = new Error('request containing private data', { cause: new Error('wrapper', { cause: new AiSetupError('Modelo indisponível.') }) });
    expect(safeAiFailure(error, context).message).toBe('Modelo indisponível.');
  });
  it('não devolve mensagens arbitrárias de exceções desconhecidas', () => {
    expect(safeAiFailure(new Error('my private prompt'), context).message).not.toContain('my private prompt');
  });
});
