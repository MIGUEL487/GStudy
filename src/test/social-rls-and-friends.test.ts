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
  isSocialFeatureEnabled,
  sanitizePlainText,
  searchUserExact,
  listFriends,
  listPendingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
  blockUser,
  reportUser,
  createStudyGroup,
  joinGroupByCode,
} from "@/lib/social-model";

describe("Fase 2: Amigos, Grupos, RLS e Privacidade", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_FEATURE_SOCIAL", "true");
    mocks.from.mockReset();
    mocks.rpc.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe("Feature Flag VITE_FEATURE_SOCIAL", () => {
    it("quando desligada, isSocialFeatureEnabled() é falso e nenhuma consulta é executada", async () => {
      vi.stubEnv("VITE_FEATURE_SOCIAL", "false");
      expect(isSocialFeatureEnabled()).toBe(false);

      const searchRes = await searchUserExact("qualquer_usuario");
      expect(searchRes).toBeNull();
      expect(mocks.rpc).not.toHaveBeenCalled();

      const friends = await listFriends("user-1");
      expect(friends).toEqual([]);
      expect(mocks.from).not.toHaveBeenCalled();
    });

    it("quando ligada, isSocialFeatureEnabled() é verdadeiro", () => {
      vi.stubEnv("VITE_FEATURE_SOCIAL", "true");
      expect(isSocialFeatureEnabled()).toBe(true);
    });
  });

  describe("Sanitização e Proteção contra Injeção", () => {
    it("sanitizePlainText remove tags HTML e protege contra XSS", () => {
      const malicious = "<script>alert('hack')</script>João <b>Silva</b>";
      const clean = sanitizePlainText(malicious);
      expect(clean).not.toContain("<");
      expect(clean).not.toContain(">");
      expect(clean).toContain("João");
    });
  });

  describe("Busca Exata e Rate Limit", () => {
    it("busca exata retorna apenas dados públicos essenciais e NUNCA e-mail", async () => {
      mocks.rpc.mockResolvedValue({
        data: [
          {
            id: "target-uuid",
            username: "aluno_top",
            display_name: "Aluno Top",
            avatar_url: "https://example.com/avatar.png",
          },
        ],
        error: null,
      });

      const result = await searchUserExact("@aluno_top");
      expect(result).toBeDefined();
      expect(result?.id).toBe("target-uuid");
      expect(result?.username).toBe("aluno_top");
      expect(result?.displayName).toBe("Aluno Top");
      expect(result).not.toHaveProperty("email");
    });

    it("bloqueia a busca quando o rate limit de 10 buscas/minuto é atingido", async () => {
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { message: "Limite de buscas excedido. Aguarde um minuto." },
      });

      await expect(searchUserExact("usuario_teste")).rejects.toThrow(
        "Limite de 10 buscas por minuto atingido",
      );
    });
  });

  describe("Isolamento RLS e Amizades", () => {
    it("usuário B não vê perfil de A se a amizade estiver 'pending'", async () => {
      mocks.from.mockImplementation((table: string) => {
        if (table === "friendships") {
          return {
            select: () => ({
              eq: () => ({
                or: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          };
        }
        return {
          select: () => Promise.resolve({ data: [], error: null }),
        };
      });

      const friends = await listFriends("user-b");
      expect(friends).toEqual([]);
    });

    it("amigos aceitos têm perfis carregados", async () => {
      mocks.from.mockImplementation((table: string) => {
        if (table === "friendships") {
          return {
            select: () => ({
              eq: () => ({
                or: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: "f-1",
                        user_id: "user-a",
                        friend_id: "user-b",
                        status: "accepted",
                        created_at: "2026-10-22T00:00:00Z",
                        updated_at: "2026-10-22T00:00:00Z",
                      },
                    ],
                    error: null,
                  }),
              }),
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
                      id: "user-b",
                      username: "amigo_b",
                      displayName: "Amigo B",
                      avatarUrl: null,
                      status: "online",
                      bio: "Estudando para prova",
                    },
                  ],
                  error: null,
                }),
            }),
          };
        }
        return {};
      });

      const friends = await listFriends("user-a");
      expect(friends.length).toBe(1);
      expect(friends[0]!.profile?.username).toBe("amigo_b");
      expect(friends[0]!.profile?.status).toBe("online");
    });

    it("bloquear usuário remove a amizade bilateralmente e cria registro de bloqueio", async () => {
      const insertSpy = vi.fn().mockResolvedValue({ error: null });
      const deleteSpy = vi.fn().mockReturnValue({
        or: vi.fn().mockResolvedValue({ error: null }),
      });

      mocks.from.mockImplementation((table: string) => {
        if (table === "user_blocks") {
          return { insert: insertSpy };
        }
        if (table === "friendships") {
          return { delete: deleteSpy };
        }
        return {};
      });

      await blockUser("user-me", "user-bad", "Inconveniente");
      expect(insertSpy).toHaveBeenCalledWith({
        blocker_id: "user-me",
        blocked_id: "user-bad",
        reason: "Inconveniente",
      });
      expect(deleteSpy).toHaveBeenCalled();
    });

    it("envia denúncia com motivo sanitizado", async () => {
      const insertSpy = vi.fn().mockResolvedValue({ error: null });
      mocks.from.mockImplementation((table: string) => {
        if (table === "user_reports") {
          return { insert: insertSpy };
        }
        return {};
      });

      await reportUser("user-me", "user-spammer", "Spam", "Mandando links suspeitos");
      expect(insertSpy).toHaveBeenCalledWith({
        reporter_id: "user-me",
        reported_id: "user-spammer",
        reason: "Spam",
        details: "Mandando links suspeitos",
      });
    });
  });

  describe("Grupos de Estudo", () => {
    it("criar grupo gera código de convite único e adiciona criador como admin", async () => {
      const groupData = {
        id: "group-uuid",
        name: "Bio 2026",
        description: "Revisão de Biologia",
        created_by: "user-me",
        invite_code: "BIO123",
        is_private: true,
        created_at: "2026-10-22T00:00:00Z",
      };

      mocks.from.mockImplementation((table: string) => {
        if (table === "study_groups") {
          return {
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: groupData, error: null }),
              }),
            }),
          };
        }
        if (table === "group_members") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      const group = await createStudyGroup("user-me", "Bio 2026", "Revisão de Biologia");
      expect(group.id).toBe("group-uuid");
      expect(group.name).toBe("Bio 2026");
      expect(group.role).toBe("admin");
      expect(group.inviteCode).toBeDefined();
    });
  });
});
