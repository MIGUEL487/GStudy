import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
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
    } as unknown as SupabaseClient;

    const result = await enforceServerAiQuota(mockSupabase, "user-123", "quiz");
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
    expect(result.remaining).toBe(9);
    expect(mockRpc).toHaveBeenCalledWith("check_and_consume_ai_quota", {
      p_action: "quiz",
      p_max_limit: SERVER_AI_LIMITS.quiz,
    });
  });

  it("bloqueia e lança ServerAiQuotaExceededError quando a cota atinge o limite", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: { allowed: false, count: 10, limit: 10, remaining: 0 },
      error: null,
    });

    const mockSupabase = {
      rpc: mockRpc,
    } as unknown as SupabaseClient;

    await expect(enforceServerAiQuota(mockSupabase, "user-123", "quiz")).rejects.toThrow(
      ServerAiQuotaExceededError,
    );
    await expect(enforceServerAiQuota(mockSupabase, "user-123", "quiz")).rejects.toThrow(
      "Você fez muitas solicitações de IA",
    );
  });

  it("bloqueia geração sem inventar cota disponível quando a RPC está ausente", async () => {
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
        return {} as unknown;
      }),
    } as unknown as SupabaseClient;

    await expect(enforceServerAiQuota(mockSupabase, "user-123", "flashcards")).rejects.toThrow(
      /aguardando uma atualização/,
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("não usa leitura não atômica para contornar a RPC", async () => {
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
    } as unknown as SupabaseClient;

    await expect(enforceServerAiQuota(mockSupabase, "user-123", "quiz")).rejects.toThrow(
      /aguardando uma atualização/,
    );
  });
});
