import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  StudyRoomVoiceMesh,
  isVoiceFeatureEnabled,
  isDndEnabled,
  setDndEnabled,
  MAX_VOICE_PARTICIPANTS,
  CALL_INVITE_TIMEOUT_MS,
  type CallInvite,
} from "@/lib/webrtc-voice-model";

const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: (...args: unknown[]) => mocks.channel(...args),
    removeChannel: (...args: unknown[]) => mocks.removeChannel(...args),
  },
}));

describe("WebRTC Voice Mesh — Study Room Audio & Bloco 8", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("verifica se flag VITE_FEATURE_VOICE responde corretamente", () => {
    expect(typeof isVoiceFeatureEnabled()).toBe("boolean");
  });

  it("inicia SEMPRE com o microfone mutado por padrão de privacidade", () => {
    const mesh = new StudyRoomVoiceMesh("room-123", "user-456");
    expect(mesh.getMutedState()).toBe(true);
    expect(mesh.getSpeakingState()).toBe(false);
    expect(mesh.getDeafenedState()).toBe(false);
    expect(mesh.getScreenSharingState()).toBe(false);
  });

  it("limita a capacidade máxima de participantes mesh a 6", () => {
    expect(MAX_VOICE_PARTICIPANTS).toBe(6);
  });

  it("solicita getUserMedia ao desmutar pela primeira vez e notifica callback", async () => {
    const mockTrack = { enabled: true, stop: vi.fn() };
    const mockStream = {
      getAudioTracks: vi.fn().mockReturnValue([mockTrack]),
      getTracks: vi.fn().mockReturnValue([mockTrack]),
    };
    const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);

    Object.defineProperty(globalThis, "navigator", {
      value: {
        mediaDevices: {
          getUserMedia: getUserMediaMock,
        },
      },
      configurable: true,
      writable: true,
    });

    const onVoiceStateChange = vi.fn();
    const mesh = new StudyRoomVoiceMesh("room-123", "user-456", { onVoiceStateChange });

    const newMutedState = await mesh.toggleMute();
    expect(newMutedState).toBe(false);
    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    expect(onVoiceStateChange).toHaveBeenCalledWith(false);

    // Muta de volta
    const mutedAgain = await mesh.toggleMute();
    expect(mutedAgain).toBe(true);
    expect(mockTrack.enabled).toBe(false);
    expect(onVoiceStateChange).toHaveBeenCalledWith(true);

    mesh.disconnect();
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it("permite ensurdecer (deafen) mutando microfone e áudio", () => {
    const onDeafenChange = vi.fn();
    const mesh = new StudyRoomVoiceMesh("room-123", "user-456", { onDeafenChange });

    expect(mesh.getDeafenedState()).toBe(false);

    // Ativa ensurdecer
    const deafened = mesh.toggleDeafen();
    expect(deafened).toBe(true);
    expect(mesh.getDeafenedState()).toBe(true);
    expect(mesh.getMutedState()).toBe(true);
    expect(onDeafenChange).toHaveBeenCalledWith(true);

    // Desativa ensurdecer
    const undeafened = mesh.toggleDeafen();
    expect(undeafened).toBe(false);
    expect(mesh.getDeafenedState()).toBe(false);
    expect(onDeafenChange).toHaveBeenCalledWith(false);

    mesh.disconnect();
  });

  it("inicia e encerra compartilhamento de tela com getDisplayMedia", async () => {
    const mockVideoTrack = {
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    const mockScreenStream = {
      getVideoTracks: vi.fn().mockReturnValue([mockVideoTrack]),
      getTracks: vi.fn().mockReturnValue([mockVideoTrack]),
    };
    const getDisplayMediaMock = vi.fn().mockResolvedValue(mockScreenStream);

    Object.defineProperty(globalThis, "navigator", {
      value: {
        mediaDevices: {
          getDisplayMedia: getDisplayMediaMock,
        },
      },
      configurable: true,
      writable: true,
    });

    const onScreenShareChange = vi.fn();
    const mesh = new StudyRoomVoiceMesh("room-123", "user-456", { onScreenShareChange });

    const stream = await mesh.startScreenShare();
    expect(stream).toBe(mockScreenStream);
    expect(mesh.getScreenSharingState()).toBe(true);
    expect(onScreenShareChange).toHaveBeenCalledWith(true, mockScreenStream);

    // Encerra compartilhamento
    mesh.stopScreenShare();
    expect(mesh.getScreenSharingState()).toBe(false);
    expect(mockVideoTrack.stop).toHaveBeenCalled();
    expect(onScreenShareChange).toHaveBeenCalledWith(false, null);

    mesh.disconnect();
  });

  it("rejeita novas conexões quando a capacidade de 6 participantes é atingida", async () => {
    const onError = vi.fn();
    const mesh = new StudyRoomVoiceMesh("room-123", "user-456", { onError });

    // Simula 5 peers já conectados (com o usuário local somam 6)
    for (let i = 1; i <= 5; i++) {
      (mesh as unknown as { peers: Map<string, unknown> }).peers.set(`peer-${i}`, {
        close: vi.fn(),
      } as unknown);
    }

    await mesh.callPeer("peer-6");
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("capacidade máxima de 6 participantes"),
      }),
    );

    mesh.disconnect();
  });

  describe("Sistema de 'Não Perturbar' (DND) e Convites", () => {
    it("DND inicia desligado e pode ser ativado e persistido", () => {
      expect(isDndEnabled()).toBe(false);

      setDndEnabled(true);
      expect(isDndEnabled()).toBe(true);

      setDndEnabled(false);
      expect(isDndEnabled()).toBe(false);
    });

    it("CALL_INVITE_TIMEOUT_MS é configurado para 30 segundos", () => {
      expect(CALL_INVITE_TIMEOUT_MS).toBe(30_000);
    });

    it("bloqueia recebimento de convites quando DND está ativado", () => {
      setDndEnabled(true);

      let broadcastCallback: ((payload: { payload: CallInvite }) => void) | null = null;
      mocks.channel.mockReturnValue({
        on: vi.fn((event, config, cb) => {
          broadcastCallback = cb;
          return { subscribe: vi.fn() };
        }),
      });

      const onInvite = vi.fn();
      const unsubscribe = StudyRoomVoiceMesh.listenForCallInvites("user-target", onInvite);

      // Simula chegada de convite
      if (broadcastCallback) {
        (broadcastCallback as (p: { payload: CallInvite }) => void)({
          payload: {
            id: "inv-1",
            fromUserId: "user-sender",
            fromUserName: "Pedro",
            toUserId: "user-target",
            roomId: "room-abc",
            roomTitle: "Sala de Física",
            createdAt: new Date().toISOString(),
            expiresAt: Date.now() + 30_000,
          },
        });
      }

      // Convite bloqueado por DND!
      expect(onInvite).not.toHaveBeenCalled();

      unsubscribe();
    });

    it("permite recebimento de convite dentro do prazo de 30s quando DND está desativado", () => {
      setDndEnabled(false);

      let broadcastCallback: ((payload: { payload: CallInvite }) => void) | null = null;
      mocks.channel.mockReturnValue({
        on: vi.fn((event, config, cb) => {
          broadcastCallback = cb;
          return { subscribe: vi.fn() };
        }),
      });

      const onInvite = vi.fn();
      const unsubscribe = StudyRoomVoiceMesh.listenForCallInvites("user-target", onInvite);

      const validInvite: CallInvite = {
        id: "inv-2",
        fromUserId: "user-sender",
        fromUserName: "Ana",
        toUserId: "user-target",
        roomId: "room-xyz",
        roomTitle: "Sala de Biologia",
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 25_000, // ainda válido
      };

      if (broadcastCallback) {
        (broadcastCallback as (p: { payload: CallInvite }) => void)({
          payload: validInvite,
        });
      }

      expect(onInvite).toHaveBeenCalledWith(validInvite);
      unsubscribe();
    });
  });
});
