import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardAiConfig } from '@/lib/ai-config';
const mocks = vi.hoisted(() => ({ google: vi.fn(), generateText: vi.fn() }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: mocks.google }));
vi.mock('ai', () => ({ generateText: mocks.generateText, Output: { object: vi.fn() }, jsonSchema: vi.fn(), NoObjectGeneratedError: { isInstance: () => false } }));
import { aiText } from '@/lib/ai.server';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('IA separada para a lousa', () => {
  it('não volta a uma chave antiga quando falta a chave Gemini', () => {
    expect(() => boardAiConfig({ AI_API_KEY: 'legacy-key' })).toThrow('BOARD_AI_API_KEY');
  });
  it('usa a mesma chave e modelo Gemini para imagem e conversa por texto', async () => {
    vi.stubEnv('AI_API_KEY', 'legacy-key-that-must-not-be-used');
    vi.stubEnv('BOARD_AI_API_KEY', 'vision-test-key'); vi.stubEnv('BOARD_AI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'); vi.stubEnv('BOARD_AI_MODEL', 'vision-model');
    mocks.google.mockImplementation(() => (model: string) => model);
    mocks.generateText.mockReturnValue({ text: 'Entendi o desenho!' });
    const messages = [{ role: 'user' as const, content: [{ type: 'image' as const, image: 'data:image/jpeg;base64,test' }] }];
    await aiText('Explique', messages, true);
    expect(mocks.google).toHaveBeenLastCalledWith(expect.objectContaining({ baseURL: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'vision-test-key' }));
    expect(mocks.generateText).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'vision-model', messages }));
    await aiText('Explique', [{ role: 'user', content: 'Uma explicação escrita' }]);
    expect(mocks.google).toHaveBeenLastCalledWith(expect.objectContaining({ baseURL: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'vision-test-key' }));
    expect(mocks.generateText).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'vision-model' }));
  });
});
