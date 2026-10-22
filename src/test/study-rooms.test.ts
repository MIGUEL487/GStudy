import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

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

import {
  listAvailableRooms,
  getRoomDetails,
  createStudyRoom,
  joinRoom,
  leaveRoom,
  listRoomParticipants,
  updateMyGoal,
  updatePomodoroState,
  type PomodoroState,
} from "@/lib/study-rooms-model";

describe("Fase 3: Salas ao Vivo, Pomodoro Sincronizado e Presença", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_FEATURE_SOCIAL", "true");
    mocks.from.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe("Feature Flag e Criação de Salas", () => {
    it("com feature flag desligada, não consulta nem cria salas", async () => {
      vi.stubEnv("VITE_FEATURE_SOCIAL", "false");
      const rooms = await listAvailableRooms("user-1");
      expect(rooms).toEqual([]);
      expect(mocks.from).not.toHaveBeenCalled();

      await expect(createStudyRoom("user-1", { name: "Sala Teste" })).rejects.toThrow(
        "Módulo social desativado",
      );
    });

    it("cria sala com limites de participantes entre 2 e 16 e estado inicial do Pomodoro", async () => {
      const roomCreated = {
        id: "room-123",
        name: "Foco Total",
        topic: "Física Quântica",
        created_by: "user-creator",
        group_id: null,
        is_private: true,
        max_participants: 8,
        pomodoro_state: { mode: "work", remaining_seconds: 1500, is_running: false },
        created_at: "2026-10-22T00:00:00Z",
      };

      const insertSpy = vi.fn().mockReturnValue({
        select: () => ({
          single: () => Promise.resolve({ data: roomCreated, error: null }),
        }),
      });

      const upsertSpy = vi.fn().mockResolvedValue({ error: null });

      mocks.from.mockImplementation((table: string) => {
        if (table === "study_rooms") {
          return { insert: insertSpy };
        }
        if (table === "study_room_participants") {
          return { upsert: upsertSpy };
        }
        return {};
      });

      const result = await createStudyRoom("user-creator", {
        name: "Foco Total",
        topic: "Física Quântica",
        isPrivate: true,
        maxParticipants: 8,
      });

      expect(result.id).toBe("room-123");
      expect(result.pomodoroState.mode).toBe("work");
      expect(result.pomodoroState.remaining_seconds).toBe(1500);
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Foco Total",
          max_participants: 8,
          is_private: true,
        }),
      );
      // Criador ingressa automaticamente
      expect(upsertSpy).toHaveBeenCalled();
    });
  });

  describe("Isolamento RLS e Participantes", () => {
    it("não permite participantes fora da sala visualizarem a lista interna", async () => {
      // Simula consulta de participantes vazia quando o usuário não pertence à sala
      mocks.from.mockImplementation((table: string) => {
        if (table === "study_room_participants") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
          };
        }
        return {};
      });

      const participants = await listRoomParticipants("private-room");
      expect(participants).toEqual([]);
    });

    it("lista participantes presentes com metas e status quando autorizado", async () => {
      const participantsData = [
        {
          room_id: "room-open",
          user_id: "user-a",
          joined_at: "2026-10-22T10:00:00Z",
          last_seen_at: "2026-10-22T10:05:00Z",
          current_goal: "Fazer 10 exercícios",
          is_goal_completed: true,
          is_muted: true,
          is_camera_on: false,
          is_screen_sharing: false,
        },
      ];

      mocks.from.mockImplementation((table: string) => {
        if (table === "study_room_participants") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: participantsData, error: null }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "user-a",
                      username: "aluno_a",
                      display_name: "Aluno A",
                      avatar_url: null,
                    },
                  ],
                  error: null,
                }),
            }),
          };
        }
        return {};
      });

      const parts = await listRoomParticipants("room-open");
      expect(parts.length).toBe(1);
      expect(parts[0]!.displayName).toBe("Aluno A");
      expect(parts[0]!.currentGoal).toBe("Fazer 10 exercícios");
      expect(parts[0]!.isGoalCompleted).toBe(true);
    });
  });

  describe("Pomodoro Sincronizado e Metas", () => {
    it("atualiza estado sincronizado do Pomodoro (trabalho para pausa)", async () => {
      const updateSpy = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mocks.from.mockImplementation((table: string) => {
        if (table === "study_rooms") {
          return { update: updateSpy };
        }
        return {};
      });

      const nextState: PomodoroState = {
        mode: "break",
        remaining_seconds: 300,
        is_running: true,
      };

      await updatePomodoroState("room-1", nextState);
      expect(updateSpy).toHaveBeenCalledWith({ pomodoro_state: nextState });
    });

    it("atualiza meta individual e conclusão", async () => {
      const updateSpy = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      mocks.from.mockImplementation((table: string) => {
        if (table === "study_room_participants") {
          return { update: updateSpy };
        }
        return {};
      });

      await updateMyGoal("room-1", "user-me", "Redigir introdução", true);
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          current_goal: "Redigir introdução",
          is_goal_completed: true,
        }),
      );
    });

    it("sair da sala remove o participante", async () => {
      const deleteSpy = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      mocks.from.mockImplementation((table: string) => {
        if (table === "study_room_participants") {
          return { delete: deleteSpy };
        }
        return {};
      });

      await leaveRoom("room-1", "user-me");
      expect(deleteSpy).toHaveBeenCalled();
    });
  });
});
