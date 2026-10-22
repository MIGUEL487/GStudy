import { describe, it, expect, vi, beforeEach } from "vitest";
import { listRoomMessages, sendRoomMessage, playNotificationSound } from "@/lib/study-rooms-model";

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

describe("Study Rooms Chat — Real-time Ephemeral Messaging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recusa envio de mensagem vazia ou com apenas espaços", async () => {
    await expect(sendRoomMessage("room-123", "   ", "maria", "Maria")).rejects.toThrow(
      "A mensagem não pode ser vazia.",
    );
  });

  it("recusa envio de mensagem com mais de 500 caracteres", async () => {
    const hugeText = "a".repeat(501);
    await expect(sendRoomMessage("room-123", hugeText, "maria", "Maria")).rejects.toThrow(
      "A mensagem deve ter no máximo 500 caracteres.",
    );
  });

  it("sanitiza tags HTML e scripts ao enviar mensagem de texto puro", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: "msg-abc-123",
      error: null,
    });

    const malicious = "<script>alert('xss')</script>Olá colegas! <b>Foco total</b>";
    const msgId = await sendRoomMessage("room-123", malicious, "miguel", "Miguel");

    expect(msgId).toBe("msg-abc-123");
    expect(mocks.rpc).toHaveBeenCalledWith("send_room_message", {
      p_room_id: "room-123",
      p_content: "scriptalert('xss')/scriptOlá colegas! bFoco total/b",
      p_sender_username: "miguel",
      p_sender_display_name: "Miguel",
    });
  });

  it("chama fallback de insert caso RPC falhe", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "RPC not found" },
    });

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: "inserted-456" },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

    mocks.from.mockImplementation((table: string) => {
      if (table === "study_room_messages") {
        return { insert: mockInsert };
      }
      return {};
    });

    const res = await sendRoomMessage("room-123", "Bons estudos!", "miguel", "Miguel");
    expect(res).toBe("inserted-456");
    expect(mockInsert).toHaveBeenCalledWith({
      room_id: "room-123",
      content: "Bons estudos!",
      sender_username: "miguel",
      sender_display_name: "Miguel",
    });
  });

  it("lista mensagens da sala em ordem cronológica", async () => {
    const rawMessages = [
      {
        id: "m-1",
        room_id: "room-123",
        user_id: "u-1",
        sender_username: "ana",
        sender_display_name: "Ana",
        content: "Comecei agora",
        created_at: "2026-10-22T10:00:00Z",
      },
      {
        id: "m-2",
        room_id: "room-123",
        user_id: "u-2",
        sender_username: "bruno",
        sender_display_name: "Bruno",
        content: "Estou no bloco 2",
        created_at: "2026-10-22T10:01:00Z",
      },
    ];

    const mockLimit = vi.fn().mockResolvedValue({ data: rawMessages, error: null });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

    mocks.from.mockImplementation((table: string) => {
      if (table === "study_room_messages") {
        return { select: mockSelect };
      }
      return {};
    });

    const msgs = await listRoomMessages("room-123", 50);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].senderUsername).toBe("ana");
    expect(msgs[1].content).toBe("Estou no bloco 2");
  });

  it("executa playNotificationSound sem erros mesmo se ambiente web audio não estiver disponível", () => {
    expect(() => playNotificationSound()).not.toThrow();
  });
});
