import { describe, expect, it, vi } from "vitest";
import {
  enforceServerAiQuota,
  SERVER_AI_LIMITS,
  ServerAiQuotaExceededError,
} from "../lib/server-ai-quota";

describe("Server AI Quota", () => {
  it("permite consumo dentro do limite diário", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: { allowed: true, count: 1, limit: 10, remaining: 9 },
      error: null,
    });

    const mockSupabase = {
      rpc: mockRpc,
    } as any;

    const result = await enforceServerAiQuota(mockSupabase, "user-123", "quiz");
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
    expect(result.remaining).toBe(9);
    expect(mockRpc).toHaveBeenCalledWith("check_and_consume_ai_quota", {
      p_action: "quiz",
      p_max_limit: 10,
    });
  });

  it("bloqueia e lança ServerAiQuotaExceededError quando a cota atinge o limite", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: { allowed: false, count: 10, limit: 10, remaining: 0 },
      error: null,
    });

    const mockSupabase = {
      rpc: mockRpc,
    } as any;

    await expect(enforceServerAiQuota(mockSupabase, "user-123", "quiz")).rejects.toThrow(
      ServerAiQuotaExceededError,
    );
    await expect(enforceServerAiQuota(mockSupabase, "user-123", "quiz")).rejects.toThrow(
      "Limite diário de IA atingido para Quiz",
    );
  });

  it("faz fallback para a tabela direta quando a RPC não está disponível", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42883", message: "function check_and_consume_ai_quota does not exist" },
    });

    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { count: 3 }, error: null }),
    });

    const mockSupabase = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        if (table === "user_daily_ai_usage") {
          return {
            select: mockSelect,
            upsert: mockUpsert,
          };
        }
        return {} as any;
      }),
    } as any;

    const result = await enforceServerAiQuota(mockSupabase, "user-123", "flashcards");
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(4);
    expect(result.remaining).toBe(SERVER_AI_LIMITS.flashcards - 4);
    expect(mockUpsert).toHaveBeenCalled();
  });

  it("bloqueia na tabela direta quando o limite é excedido", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42883" },
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { count: 10 }, error: null }),
    });

    const mockSupabase = {
      rpc: mockRpc,
      from: vi.fn().mockReturnValue({
        select: mockSelect,
      }),
    } as any;

    await expect(enforceServerAiQuota(mockSupabase, "user-123", "quiz")).rejects.toThrow(
      ServerAiQuotaExceededError,
    );
  });
});
