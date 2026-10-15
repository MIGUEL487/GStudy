import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardAiConfig } from '@/lib/ai-config';
const mocks = vi.hoisted(() => ({ compatible: vi.fn(), openai: vi.fn(), streamText: vi.fn() }));
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: mocks.compatible }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mocks.openai }));
vi.mock('ai', () => ({ streamText: mocks.streamText, Output: { object: vi.fn() }, jsonSchema: vi.fn(), NoObjectGeneratedError: { isInstance: () => false } }));
import { aiText } from '@/lib/ai.server';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('IA separada para a lousa', () => {
  it('exige configuração completa, sem enviar desenhos para o provedor de texto', () => {
    expect(() => boardAiConfig({ AI_API_KEY: 'text-key', BOARD_AI_API_KEY: 'vision-key' })).toThrow('BOARD_AI_MODEL');
  });
  it('envia a imagem ao modelo de visão e mantém o Aion nas mensagens de texto', async () => {
    vi.stubEnv('AI_API_KEY', 'text-test-key'); vi.stubEnv('AI_BASE_URL', 'https://api.aionlabs.ai/v1'); vi.stubEnv('AI_MODEL', 'aion-labs/aion-2.0');
    vi.stubEnv('BOARD_AI_API_KEY', 'vision-test-key'); vi.stubEnv('BOARD_AI_BASE_URL', 'https://vision.example/v1'); vi.stubEnv('BOARD_AI_MODEL', 'vision-model');
    mocks.compatible.mockImplementation(() => ({ chatModel: (model: string) => model }));
    mocks.streamText.mockReturnValue({ text: Promise.resolve('Entendi o desenho!') });
    const messages = [{ role: 'user' as const, content: [{ type: 'image' as const, image: 'data:image/jpeg;base64,test' }] }];
    await aiText('Explique', messages, true);
    expect(mocks.compatible).toHaveBeenLastCalledWith(expect.objectContaining({ baseURL: 'https://vision.example/v1', headers: { Authorization: 'Bearer vision-test-key' } }));
    expect(mocks.streamText).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'vision-model', messages }));
    await aiText('Explique', [{ role: 'user', content: 'Uma explicação escrita' }]);
    expect(mocks.compatible).toHaveBeenLastCalledWith(expect.objectContaining({ baseURL: 'https://api.aionlabs.ai/v1', headers: { Authorization: 'Bearer text-test-key' } }));
    expect(mocks.streamText).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'aion-labs/aion-2.0' }));
  });
});
