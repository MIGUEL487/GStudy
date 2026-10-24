import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CallScreen from "@/components/voice/call-screen";
import { IncomingCall, StartCallButton, VoicePreferences } from "@/components/voice/voice-controls";
const fixture = vi.hoisted(() => ({ voice: null as Record<string, unknown> | null }));
vi.mock("@/components/voice/voice-provider", () => ({ useVoice: () => fixture.voice }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
describe("Interface de chamadas explícitas", () => {
  beforeEach(() => {
    fixture.voice = {
      userId: "a",
      callId: null,
      snapshot: null,
      inbox: { invites: [], preferences: {} },
      now: Date.now(),
      busy: false,
      error: "",
      muted: true,
      ready: true,
      screens: new Map(),
      connections: new Map(),
      start: vi.fn(),
      respond: vi.fn(),
      dnd: vi.fn(),
      bindLevel: vi.fn(),
      toggleMute: vi.fn(),
      leave: vi.fn(),
      resumeAudio: vi.fn(),
    };
  });
  afterEach(cleanup);
  it("não inicia uma chamada ao renderizar uma sala", () => {
    render(<StartCallButton roomId="room" />);
    expect(fixture.voice!.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ligar" }));
    expect(fixture.voice!.start).toHaveBeenCalledWith("room", undefined);
  });
  it("some com a flag desativada", () => {
    fixture.voice = null;
    const { container } = render(<StartCallButton roomId="room" />);
    expect(container).toBeEmptyDOMElement();
  });
  it("não atende ao receber um convite e não exibe convite expirado", () => {
    fixture.voice!.inbox = {
      preferences: {},
      invites: [
        {
          id: "invite",
          name: "Bruno",
          call_id: "call",
          avatar_url: null,
          title: "Grupo",
          expires_at: new Date(Date.now() + 25000).toISOString(),
        },
      ],
    };
    const { rerender } = render(<IncomingCall />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(fixture.voice!.respond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    expect(fixture.voice!.respond).toHaveBeenCalledWith("invite", false);
    fixture.voice!.now = Date.now() + 30000;
    rerender(<IncomingCall />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("envia a duração de Não perturbar ao servidor sem chave local global", () => {
    render(<VoicePreferences />);
    fireEvent.change(screen.getByLabelText("Duração de Não perturbar"), {
      target: { value: "today" },
    });
    expect(fixture.voice!.dnd).toHaveBeenCalledWith("today");
  });
  it("mostra estado de privacidade e controles, sem pedir mídia automaticamente", () => {
    fixture.voice!.callId = "call";
    fixture.voice!.snapshot = {
      title: "Sala",
      can_moderate: false,
      members: [
        {
          user_id: "a",
          name: "Ana",
          avatar_url: null,
          muted: true,
          force_muted: false,
          sharing: false,
        },
      ],
      candidates: [],
    };
    render(<CallScreen />);
    expect(screen.getByText(/não é gravada/)).toBeInTheDocument();
    expect(fixture.voice!.toggleMute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ativar microfone" }));
    expect(fixture.voice!.toggleMute).toHaveBeenCalledOnce();
  });
});
