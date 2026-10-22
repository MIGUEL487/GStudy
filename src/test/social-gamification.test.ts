import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSocialLeaderboard,
  listUserAchievements,
  updateRankingVisibility,
  recordFocusSession,
  triggerGoalCelebration,
} from "@/lib/social-gamification-model";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  },
}));

vi.mock("@/lib/social-model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/social-model")>();
  return {
    ...actual,
    isSocialFeatureEnabled: () => true,
  };
});

describe("Social Gamification, Leaderboards & Achievements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("busca ranking semanal via RPC respeitando escopo de amigos", async () => {
    const mockRpcData = [
      {
        user_id: "u-1",
        display_name: "Helena",
        username: "helena",
        avatar_url: null,
        weekly_focus_minutes: 180,
        rank_position: 1,
        is_current_user: false,
      },
      {
        user_id: "u-2",
        display_name: "Você",
        username: "miguel",
        avatar_url: "https://example.com/avatar.png",
        weekly_focus_minutes: 120,
        rank_position: 2,
        is_current_user: true,
      },
    ];

    mocks.rpc.mockResolvedValueOnce({
      data: mockRpcData,
      error: null,
    });

    const leaderboard = await getSocialLeaderboard("friends");

    expect(mocks.rpc).toHaveBeenCalledWith("get_social_leaderboard", {
      p_scope: "friends",
      p_group_id: null,
    });
    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0].displayName).toBe("Helena");
    expect(leaderboard[0].weeklyFocusMinutes).toBe(180);
    expect(leaderboard[1].isCurrentUser).toBe(true);
  });

  it("atualiza visibilidade de ranking (anônimo, oculto, público) no perfil", async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });

    mocks.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return { update: mockUpdate };
      }
      return {};
    });

    await updateRankingVisibility("u-123", "anonymous");

    expect(mockUpdate).toHaveBeenCalledWith({ ranking_visibility: "anonymous" });
    expect(mockEq).toHaveBeenCalledWith("id", "u-123");
  });

  it("registra sessão de foco na sala via RPC segura", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: null });

    await recordFocusSession("room-abc", 25);

    expect(mocks.rpc).toHaveBeenCalledWith("record_room_focus_session", {
      p_room_id: "room-abc",
      p_minutes: 25,
    });
  });

  it("lista conquistas sociais do usuário ordenadas por desbloqueio", async () => {
    const mockOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: "ach-1",
          user_id: "u-123",
          achievement_key: "first_group_session",
          title: "Primeiro Foco Coletivo",
          description: "Concluiu seu primeiro bloco de foco",
          icon: "users",
          unlocked_at: "2026-10-22T08:00:00Z",
        },
      ],
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

    mocks.from.mockImplementation((table: string) => {
      if (table === "social_achievements") {
        return { select: mockSelect };
      }
      return {};
    });

    const achs = await listUserAchievements("u-123");

    expect(achs).toHaveLength(1);
    expect(achs[0].title).toBe("Primeiro Foco Coletivo");
    expect(achs[0].achievementKey).toBe("first_group_session");
  });

  it("triggerGoalCelebration não dispara partículas quando prefers-reduced-motion está ativo", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    // Expect no particles added to DOM
    triggerGoalCelebration();
    const container = document.querySelector(".celebration-confetti-container");
    expect(container).toBeNull();

    window.matchMedia = originalMatchMedia;
  });
});
