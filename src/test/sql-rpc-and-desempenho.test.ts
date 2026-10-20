import { describe, expect, it, vi, beforeEach } from "vitest";
import { awardXp } from "@/lib/learn-client";
import { databaseFailure } from "@/lib/notion.server";
import { absenceBudget, emptyPerformance, schoolYearWeeks } from "@/lib/study-model";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.authGetUser },
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

describe("SQL RPC & Progress (award_learner_xp)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("não concede XP se o usuário não estiver autenticado", async () => {
    mocks.authGetUser.mockResolvedValue({ data: { user: null } });
    const result = await awardXp(50);
    expect(result).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("chama a RPC atômica award_learner_xp e retorna o novo total de XP e ofensiva", async () => {
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-456" } } });
    mocks.rpc.mockResolvedValue({
      data: {
        user_id: "user-456",
        xp: 150,
        streak: 3,
        last_day: new Date().toISOString().slice(0, 10),
      },
      error: null,
    });

    const result = await awardXp(50);
    expect(mocks.rpc).toHaveBeenCalledWith("award_learner_xp", { p_amount: 50 });
    expect(result).toEqual({
      user_id: "user-456",
      xp: 150,
      streak: 3,
      last_day: expect.any(String),
    });
  });

  it("recorre ao fallback com leitura de learner_stats se a RPC falhar", async () => {
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-456" } } });
    mocks.rpc.mockRejectedValue(new Error("RPC not found"));

    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const mockSelect = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { xp: 100, streak: 2, last_day: "2026-10-18" },
        error: null,
      }),
    });

    mocks.from.mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
    });

    const result = await awardXp(50);
    expect(result).toBeDefined();
    expect(mockUpsert).toHaveBeenCalled();
  });
});

describe("Notion Server databaseFailure", () => {
  it("informa migração ausente quando código for 42P01 ou PGRST205", () => {
    expect(() => databaseFailure({ code: "42P01" })).toThrow(
      "A integração Notion precisa da migração 0001_notion.sql no SQL Editor do Supabase.",
    );
    expect(() => databaseFailure({ code: "PGRST205" })).toThrow(
      "A integração Notion precisa da migração 0001_notion.sql no SQL Editor do Supabase.",
    );
  });

  it("informa mensagem genérica em erros inesperados", () => {
    expect(() => databaseFailure({ code: "50000", message: "Erro desconhecido" })).toThrow(
      "Não foi possível salvar ou consultar o Notion na sua conta. Tente novamente.",
    );
  });
});

describe("Desempenho e cálculo de faltas", () => {
  it("utiliza 40 semanas letivas derivadas do ano letivo de 200 dias", () => {
    expect(schoolYearWeeks).toBe(40);
  });

  it("calcula orçamento de faltas com base na carga horária semanal", () => {
    const budget3 = absenceBudget(3, 10);
    expect(budget3.total).toBe(120);
    expect(budget3.limit).toBe(30);

    const budget4 = absenceBudget(4, 8);
    expect(budget4.total).toBe(160);
    expect(budget4.limit).toBe(40);
  });

  it("inicializa estrutura vazia de desempenho com notas e sessões padrão", () => {
    const perf = emptyPerformance();
    expect(perf.max).toBe("");
    expect(perf.min).toBe("");
    expect(perf.grades).toHaveLength(4);
    expect(perf.sessions).toEqual([]);
  });
});
