import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VoiceCallPanel } from "@/components/voice/voice-call-panel";
import { StudyRoomVoiceMesh, isDndEnabled, setDndEnabled } from "@/lib/webrtc-voice-model";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue(true),
    })),
    removeChannel: vi.fn(),
  },
}));

describe("Bloco 8: Interface de Voz WebRTC, Controles e Convites", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    const mockTrack = { enabled: true, stop: vi.fn(), onended: null };
    const mockAudioStream = {
      getAudioTracks: vi.fn().mockReturnValue([mockTrack]),
      getTracks: vi.fn().mockReturnValue([mockTrack]),
    };
    const mockVideoStream = {
      getVideoTracks: vi.fn().mockReturnValue([mockTrack]),
      getTracks: vi.fn().mockReturnValue([mockTrack]),
    };

    Object.defineProperty(globalThis, "navigator", {
      value: {
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue(mockAudioStream),
          getDisplayMedia: vi.fn().mockResolvedValue(mockVideoStream),
        },
      },
      configurable: true,
      writable: true,
    });
  });

  it("renderiza os controles de voz com microfone mutado por padrão", () => {
    render(
      <VoiceCallPanel
        roomId="room-1"
        roomTitle="Mesa Redonda: História"
        userId="user-1"
        userName="Mariana"
      />,
    );

    expect(screen.getByText("Mesa Redonda: História")).toBeInTheDocument();
    expect(screen.getByLabelText("Desmutar microfone")).toBeInTheDocument();
    expect(screen.getByLabelText("Ensurdecer")).toBeInTheDocument();
    expect(screen.getByLabelText("Compartilhar tela")).toBeInTheDocument();
    expect(screen.getByLabelText("Sair da chamada")).toBeInTheDocument();

    // Chip de usuário local
    expect(screen.getByText(/Mariana/i)).toBeInTheDocument();
    expect(screen.getByText(/\(Você\)/i)).toBeInTheDocument();
  });

  it("permite alternar microfone e atualiza o botão", async () => {
    render(
      <VoiceCallPanel
        roomId="room-1"
        roomTitle="Sala de Estudos"
        userId="user-1"
        userName="Lucas"
      />,
    );

    const micBtn = screen.getByLabelText("Desmutar microfone");
    await act(async () => {
      fireEvent.click(micBtn);
    });

    expect(screen.getByLabelText("Mutar microfone")).toBeInTheDocument();
    expect(screen.getByText("Falando")).toBeInTheDocument();
  });

  it("permite alternar ensurdecer (deafen)", async () => {
    render(
      <VoiceCallPanel
        roomId="room-1"
        roomTitle="Sala de Estudos"
        userId="user-1"
        userName="Lucas"
      />,
    );

    const deafenBtn = screen.getByLabelText("Ensurdecer");
    act(() => {
      fireEvent.click(deafenBtn);
    });

    expect(screen.getByLabelText("Reativar áudio")).toBeInTheDocument();
  });

  it("aciona callback onDisconnect ao clicar em sair da chamada", () => {
    const onDisconnect = vi.fn();
    render(
      <VoiceCallPanel
        roomId="room-1"
        roomTitle="Sala de Estudos"
        userId="user-1"
        userName="Lucas"
        onDisconnect={onDisconnect}
      />,
    );

    const exitBtn = screen.getByLabelText("Sair da chamada");
    fireEvent.click(exitBtn);

    expect(onDisconnect).toHaveBeenCalled();
  });

  it("respeita o modo Não Perturbar (DND) e reflete na configuração", () => {
    expect(isDndEnabled()).toBe(false);

    setDndEnabled(true);
    expect(isDndEnabled()).toBe(true);

    setDndEnabled(false);
    expect(isDndEnabled()).toBe(false);
  });
});
