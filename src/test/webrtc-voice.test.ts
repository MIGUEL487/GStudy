import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { VoiceMesh, voiceIceServers } from "@/lib/voice-mesh";
import { MAX_VOICE_PARTICIPANTS, microphoneError, type VoiceMember } from "@/lib/voice-rpc";

const peers: FakePeer[] = [];
class FakePeer {
  connectionState = "new";
  remoteDescription: object | null = null;
  onicecandidate: unknown;
  ontrack: unknown;
  onconnectionstatechange: unknown;
  close = vi.fn();
  addIceCandidate = vi.fn();
  constructor() {
    peers.push(this);
  }
  addTransceiver = vi.fn(() => ({
    sender: { replaceTrack: vi.fn().mockResolvedValue(undefined) },
  }));
  createOffer = vi.fn().mockResolvedValue({ type: "offer", sdp: "offer" });
  createAnswer = vi.fn().mockResolvedValue({ type: "answer", sdp: "answer" });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn(async (desc: object) => {
    this.remoteDescription = desc;
  });
}
const member = (id: string, muted = true): VoiceMember => ({
  user_id: id,
  name: id,
  avatar_url: null,
  muted,
  force_muted: false,
  sharing: false,
});
const callbacks = () => ({
  error: vi.fn(),
  level: vi.fn(),
  screen: vi.fn(),
  sharingEnded: vi.fn(),
});
describe("Chamadas com consentimento e mídia controlada", () => {
  beforeEach(() => {
    peers.length = 0;
    vi.stubGlobal("RTCPeerConnection", FakePeer);
    vi.stubGlobal(
      "MediaStream",
      class {
        getTracks() {
          return [];
        }
        addTrack() {}
      },
    );
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it("conecta somente membros aceitos, começa mutado e mantém os peers ao atualizar a lista", async () => {
    const send = vi.fn().mockResolvedValue(undefined),
      cb = callbacks(),
      mesh = new VoiceMesh("a", send, cb);
    mesh.sync([member("a"), member("b")]);
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith("b", "offer", { type: "offer", sdp: "offer" }),
    );
    expect(mesh.isMuted).toBe(true);
    expect(peers).toHaveLength(1);
    mesh.sync([member("a"), member("b")]);
    expect(peers).toHaveLength(1);
    mesh.receive({
      id: "1",
      call_id: "call",
      sender_id: "intruso",
      recipient_id: "a",
      kind: "offer",
      payload: { type: "offer", sdp: "falso" },
    });
    expect(peers).toHaveLength(1);
    mesh.sync([member("a")]);
    expect(peers[0]!.close).toHaveBeenCalledOnce();
    mesh.close();
  });
  it("limita a malha a cinco peers e não abre microfone ao entrar", () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const mesh = new VoiceMesh("a", vi.fn().mockResolvedValue(undefined), callbacks());
    mesh.sync("abcdefghi".split("").map((id) => member(id)));
    expect(peers).toHaveLength(MAX_VOICE_PARTICIPANTS - 1);
    expect(getUserMedia).not.toHaveBeenCalled();
    mesh.close();
  });
  it("solicita permissão somente ao preparar o microfone, respeita silêncio forçado e encerra as faixas", async () => {
    const track = { enabled: true, stop: vi.fn() },
      stream = { getAudioTracks: () => [track], getTracks: () => [track] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const mesh = new VoiceMesh("a", vi.fn().mockResolvedValue(undefined), callbacks());
    await mesh.prepareMicrophone();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(track.enabled).toBe(false);
    mesh.setMuted(false);
    expect(track.enabled).toBe(true);
    mesh.sync([{ ...member("a"), force_muted: true }]);
    expect(track.enabled).toBe(false);
    mesh.close();
    expect(track.stop).toHaveBeenCalledOnce();
  });
  it("não abre microfone depois de sair enquanto a permissão estava pendente", async () => {
    let resolve!: (stream: unknown) => void;
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () =>
          new Promise((r) => {
            resolve = r;
          }),
      },
    });
    const stop = vi.fn(),
      mesh = new VoiceMesh("a", vi.fn(), callbacks());
    const pending = mesh.prepareMicrophone();
    mesh.close();
    resolve({ getTracks: () => [{ stop }] });
    await pending;
    expect(stop).toHaveBeenCalledOnce();
    expect(mesh.isMuted).toBe(true);
  });
  it("limita a tela a 720p/15fps e para ao sair", async () => {
    const track = { stop: vi.fn(), onended: null },
      stream = { getVideoTracks: () => [track], getTracks: () => [track] };
    const getDisplayMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia } });
    const mesh = new VoiceMesh("a", vi.fn(), callbacks());
    await mesh.shareScreen(true);
    expect(getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        preferCurrentTab: true,
        video: expect.objectContaining({
          frameRate: { ideal: 15, max: 15 },
          height: { ideal: 720, max: 720 },
        }),
      }),
    );
    expect(mesh.isSharing).toBe(true);
    mesh.close();
    expect(track.stop).toHaveBeenCalledOnce();
  });
  it("traduz erros de dispositivo e oferece STUN sem exigir TURN", () => {
    expect(microphoneError(new DOMException("raw", "NotAllowedError"))).toContain(
      "não foi autorizado",
    );
    expect(microphoneError(new DOMException("raw", "NotFoundError"))).toContain("Não encontramos");
    expect(voiceIceServers()[0]!.urls).toContain("stun:");
  });
});
