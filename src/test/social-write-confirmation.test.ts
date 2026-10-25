import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const backend = vi.hoisted(() => ({
  result: { data: null, error: null } as {
    data: unknown;
    error: null | { code: string; message: string };
  },
  rpc: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: () => query,
    update: () => query,
    eq: () => query,
    is: async () => backend.result,
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(backend.result).then(resolve, reject),
  };
  return { supabase: { from: () => query, rpc: (...args: unknown[]) => backend.rpc(...args) } };
});
import { markDirectMessagesAsRead } from "@/lib/direct-messages-model";
import { markAllNotificationsAsRead } from "@/lib/notifications-model";
import { saveStudentProfile, profileUpdatedEvent } from "@/lib/student-profile";
import { getSocialInbox } from "@/lib/social-inbox";
describe("Confirmação das escritas sociais e de perfil", () => {
  beforeEach(() => {
    backend.result = { data: null, error: null };
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());
  it("não anuncia leitura quando a atualização privada falha", async () => {
    backend.result.error = { code: "42501", message: "raw policy details" };
    const event = vi.spyOn(window, "dispatchEvent");
    await expect(markDirectMessagesAsRead("a", "b")).rejects.toThrow("Você não tem acesso");
    expect(event).not.toHaveBeenCalled();
  });
  it("retorna erro amigável em vez de afirmar que todas as notificações foram lidas", async () => {
    backend.result.error = { code: "PGRST205", message: "raw missing table" };
    await expect(markAllNotificationsAsRead("a")).rejects.toThrow("aguardando uma atualização");
  });
  it("não publica atualização do perfil sem confirmação do servidor", async () => {
    backend.rpc.mockResolvedValue({ data: { saved: false }, error: null });
    const updated = vi.fn();
    window.addEventListener(profileUpdatedEvent, updated);
    await expect(saveStudentProfile({ display_name: "Ana" })).rejects.toThrow("confirmar");
    expect(updated).not.toHaveBeenCalled();
    backend.rpc.mockResolvedValue({ data: { saved: true }, error: null });
    await saveStudentProfile({ display_name: "Ana" });
    expect(updated).toHaveBeenCalledOnce();
    window.removeEventListener(profileUpdatedEvent, updated);
  });
  it("não mostra um contador inventado quando a resposta do inbox é inválida", async () => {
    backend.rpc.mockResolvedValue({ data: { pending: -1, unread: { b: 3 } }, error: null });
    await expect(getSocialInbox()).rejects.toThrow("confirmar");
  });
});
