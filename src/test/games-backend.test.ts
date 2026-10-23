import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  ai: vi.fn(),
  quota: vi.fn(),
  cached: vi.fn(),
  save: vi.fn(),
  writer: vi.fn(),
}));
vi.mock("@/lib/ai.server", () => ({ aiObject: mocks.ai }));
vi.mock("@/lib/server-ai-quota", () => ({ enforceServerAiQuota: mocks.quota }));
vi.mock("@/lib/games/cache.server", () => ({ gameCacheWriter: mocks.writer }));
vi.mock("@/lib/study-auth-middleware", () => ({ requireStudyAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (value: unknown) => value;
    const builder = {
      middleware: () => builder,
      validator: (value: typeof parse) => {
        parse = value;
        return builder;
      },
      handler: (fn: (value: unknown) => unknown) => (args: { data: unknown }) => {
        const query = {
          select: () => query,
          eq: () => query,
          gt: () => query,
          maybeSingle: mocks.cached,
        };
        return fn({
          data: parse(args.data),
          context: {
            userId: "11111111-1111-4111-8111-111111111111",
            supabase: { from: () => query },
          },
        });
      },
    };
    return builder;
  },
}));
import { generateGame } from "@/lib/games.functions";
const input = {
  topic: "Cadeias alimentares",
  subject: "Biologia",
  type: "multiple-choice",
  difficulty: "medio",
};
const questions = Array.from({ length: 6 }, (_, i) => ({
  prompt: `Pergunta de biologia ${i + 1}?`,
  options: ["Produtor", "Consumidor", "Decompositor", "Outro"],
  correctIndex: 0,
  explanation: "Produtores transformam energia luminosa em energia química.",
}));
const call = (data: unknown = input) =>
  (
    generateGame as unknown as (args: { data: unknown }) => Promise<{
      game: { id: string; subject: string; questions: { medio: unknown[] } };
      cache: string;
    }>
  )({ data });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cached.mockResolvedValue({ data: null, error: null });
  mocks.ai.mockResolvedValue({ questions });
  mocks.quota.mockResolvedValue(undefined);
  mocks.save.mockResolvedValue({ error: null });
  mocks.writer.mockReturnValue({ from: () => ({ upsert: mocks.save }) });
});
describe("Geração dos jogos e cache compartilhado", () => {
  it("reutiliza um cache validado sem gastar outra geração", async () => {
    mocks.cached.mockResolvedValue({ data: { content: { questions } }, error: null });
    expect(await call()).toMatchObject({ cache: "hit", game: { subject: "biologia" } });
    expect(mocks.ai).not.toHaveBeenCalled();
    expect(mocks.quota).not.toHaveBeenCalled();
  });
  it("valida a geração em lote e só escreve o cache pelo cliente de serviço", async () => {
    const result = await call();
    expect(result.game.questions.medio).toHaveLength(6);
    expect(result.cache).toBe("saved");
    expect(result.game.id).toMatch(/^ai-[a-f0-9]{64}$/);
    expect(mocks.quota).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: input.topic,
          type: input.type,
          difficulty: input.difficulty,
        }),
      }),
    );
  });
  it("descarta cache inválido e mantém o jogo solo quando o cache de serviço não está configurado", async () => {
    mocks.cached.mockResolvedValue({
      data: { content: { questions: [{ prompt: "incompleta" }] } },
      error: null,
    });
    mocks.writer.mockReturnValue(null);
    const result = await call();
    expect(result.cache).toBe("unavailable");
    expect(result.game.questions.medio).toHaveLength(6);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("não publica respostas sem alternativa válida", async () => {
    mocks.ai.mockResolvedValue({ questions: questions.map((q) => ({ ...q, correctIndex: 99 })) });
    await expect(call()).rejects.toThrow();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
