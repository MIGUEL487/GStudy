import { describe, it, expect, vi, beforeEach } from "vitest";
import { StudyRoomVoiceMesh, isVoiceFeatureEnabled } from "@/lib/webrtc-voice-model";

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

describe("WebRTC Voice Mesh — Study Room Audio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifica se flag VITE_FEATURE_VOICE responde corretamente", () => {
    expect(typeof isVoiceFeatureEnabled()).toBe("boolean");
  });

  it("inicia SEMPRE com o microfone mutado por padrão de privacidade", () => {
    const mesh = new StudyRoomVoiceMesh("room-123", "user-456");
    expect(mesh.getMutedState()).toBe(true);
    expect(mesh.getSpeakingState()).toBe(false);
  });

  it("não solicita getUserMedia antes de o usuário acionar o desmute", () => {
    const getUserMediaMock = vi.fn();
    Object.defineProperty(globalThis, "navigator", {
      value: {
        mediaDevices: {
          getUserMedia: getUserMediaMock,
        },
      },
      configurable: true,
      writable: true,
    });

    const mesh = new StudyRoomVoiceMesh("room-123", "user-456");
    expect(getUserMediaMock).not.toHaveBeenCalled();
    mesh.disconnect();
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

  it("trata erro com segurança caso o usuário negue permissão de microfone", async () => {
    const getUserMediaMock = vi.fn().mockRejectedValue(new Error("Permission denied"));

    Object.defineProperty(globalThis, "navigator", {
      value: {
        mediaDevices: {
          getUserMedia: getUserMediaMock,
        },
      },
      configurable: true,
      writable: true,
    });

    const onError = vi.fn();
    const mesh = new StudyRoomVoiceMesh("room-123", "user-456", { onError });

    const mutedState = await mesh.toggleMute();
    expect(mutedState).toBe(true); // Permanece mutado
    expect(onError).toHaveBeenCalled();
    mesh.disconnect();
  });
});
