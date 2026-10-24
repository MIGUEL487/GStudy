import {
  MAX_VOICE_PARTICIPANTS,
  microphoneError,
  type VoiceMember,
  type VoiceSignal,
} from "./voice-rpc";
export type SignalSender = (
  recipient: string,
  kind: VoiceSignal["kind"],
  payload: object,
) => Promise<void>;
type Peer = {
  pc: RTCPeerConnection;
  audio: RTCRtpTransceiver;
  video: RTCRtpTransceiver;
  element: HTMLAudioElement;
  candidates: RTCIceCandidateInit[];
  muted: boolean;
  stream: MediaStream;
  cleanupLevel?: () => void;
  failureTimer?: ReturnType<typeof setTimeout>;
};
type Callbacks = {
  error: (message: string) => void;
  level: (id: string, value: number) => void;
  screen: (id: string, stream: MediaStream | null) => void;
  sharingEnded: () => void;
  connection?: (id: string, state: RTCPeerConnectionState) => void;
};
export function voiceIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];
  const urls = import.meta.env["VITE_TURN_URL"]?.trim();
  if (urls && /^turns?:/i.test(urls))
    servers.push({
      urls,
      username: import.meta.env["VITE_TURN_USERNAME"],
      credential: import.meta.env["VITE_TURN_CREDENTIAL"],
    });
  return servers;
}
export class VoiceMesh {
  private peers = new Map<string, Peer>();
  private local: MediaStream | null = null;
  private screen: MediaStream | null = null;
  private closed = false;
  private muted = true;
  private context: AudioContext | null = null;
  private localLevel: (() => void) | undefined;
  private members = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private userId: string,
    private send: SignalSender,
    private callbacks: Callbacks,
  ) {}
  get isMuted() {
    return this.muted;
  }
  get isSharing() {
    return Boolean(this.screen);
  }
  private analyse(stream: MediaStream, id: string, isMuted: () => boolean) {
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
      const source = this.context.createMediaStreamSource(stream),
        analyser = this.context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let frame = 0,
        smoothed = 0,
        stopped = false;
      const tick = () => {
        if (stopped || this.closed) return;
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(
          samples.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) / samples.length,
        );
        const next = isMuted() ? 0 : Math.min(1, rms * 7);
        smoothed += (next - smoothed) * (next > smoothed ? 0.3 : 0.12);
        this.callbacks.level(id, smoothed);
        frame = requestAnimationFrame(tick);
      };
      tick();
      return () => {
        stopped = true;
        cancelAnimationFrame(frame);
        source.disconnect();
        analyser.disconnect();
        this.callbacks.level(id, 0);
      };
    } catch {
      return () => {};
    }
  }
  async prepareMicrophone() {
    if (this.local || this.closed) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (this.closed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
      this.local = stream;
      this.localLevel = this.analyse(stream, this.userId, () => this.muted);
      await Promise.all(
        [...this.peers.values()].map((p) =>
          p.audio.sender.replaceTrack(stream.getAudioTracks()[0]!),
        ),
      );
    } catch (error) {
      throw new Error(microphoneError(error));
    }
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    this.local?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    if (muted) this.callbacks.level(this.userId, 0);
  }
  async shareScreen(currentTab: boolean) {
    if (this.closed || !navigator.mediaDevices?.getDisplayMedia) return;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 15, max: 15 },
      },
      audio: false,
      ...(currentTab ? { preferCurrentTab: true } : {}),
    });
    if (this.closed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stopSharing();
    this.screen = stream;
    const track = stream.getVideoTracks()[0]!;
    track.onended = () => {
      this.stopSharing();
      this.callbacks.sharingEnded();
    };
    await Promise.all([...this.peers.values()].map((p) => p.video.sender.replaceTrack(track)));
    this.callbacks.screen(this.userId, stream);
  }
  stopSharing() {
    const stream = this.screen;
    this.screen = null;
    stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    for (const p of this.peers.values()) void p.video.sender.replaceTrack(null).catch(() => {});
    this.callbacks.screen(this.userId, null);
  }
  private createPeer(id: string) {
    const existing = this.peers.get(id);
    if (existing) return existing;
    if (this.closed || !this.members.has(id) || this.peers.size >= MAX_VOICE_PARTICIPANTS - 1)
      return null;
    const pc = new RTCPeerConnection({ iceServers: voiceIceServers() }),
      element = document.createElement("audio");
    element.autoplay = true;
    element.setAttribute("playsinline", "");
    const p: Peer = {
      pc,
      audio: pc.addTransceiver("audio", { direction: "sendrecv" }),
      video: pc.addTransceiver("video", { direction: "sendrecv" }),
      element,
      candidates: [],
      muted: true,
      stream: new MediaStream(),
    };
    this.peers.set(id, p);
    if (this.local) void p.audio.sender.replaceTrack(this.local.getAudioTracks()[0]!);
    if (this.screen) void p.video.sender.replaceTrack(this.screen.getVideoTracks()[0]!);
    pc.onicecandidate = (event) => {
      if (event.candidate)
        void this.send(id, "ice", event.candidate.toJSON()).catch(() =>
          this.callbacks.error(
            "Não foi possível conectar o áudio. Confira a internet e tente entrar novamente.",
          ),
        );
    };
    pc.ontrack = (event) => {
      if (event.track.kind === "audio") {
        const stream = new MediaStream([event.track]);
        element.srcObject = stream;
        element.muted = p.muted;
        void element
          .play()
          .catch(() => this.callbacks.error("Toque em Ativar áudio para ouvir a chamada."));
        p.cleanupLevel?.();
        p.cleanupLevel = this.analyse(stream, id, () => p.muted);
      } else {
        p.stream.addTrack(event.track);
        this.callbacks.screen(id, p.stream);
      }
    };
    pc.onconnectionstatechange = () => {
      this.callbacks.connection?.(id, pc.connectionState);
      if (p.failureTimer) clearTimeout(p.failureTimer);
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected")
        p.failureTimer = setTimeout(() => {
          if (!this.closed)
            this.callbacks.error(
              "Não foi possível conectar todos os participantes. Confira a rede; algumas conexões precisam de um servidor TURN configurado. Saia e entre novamente.",
            );
        }, 8000);
    };
    pc.onicegatheringstatechange = () => {
      if (
        pc.iceGatheringState === "complete" &&
        !pc.localDescription?.sdp.includes("a=candidate:")
      ) {
        this.callbacks.error(
          "Sua rede não disponibilizou uma conexão de áudio. Algumas redes e navegadores exigem um servidor TURN configurado. Você pode sair da chamada e tentar em outra rede.",
        );
      }
    };
    return p;
  }
  sync(members: VoiceMember[]) {
    this.members = new Set(members.filter((m) => m.user_id !== this.userId).map((m) => m.user_id));
    for (const [id, p] of this.peers)
      if (!this.members.has(id)) {
        this.dropPeer(id, p);
      }
    for (const member of members) {
      if (member.user_id === this.userId) {
        if (member.force_muted) this.setMuted(true);
        continue;
      }
      const existed = this.peers.has(member.user_id),
        p = this.createPeer(member.user_id);
      if (!p) continue;
      p.muted = member.muted || member.force_muted;
      p.element.muted = p.muted;
      if (!existed && this.userId < member.user_id)
        this.enqueue(async () => {
          const offer = await p.pc.createOffer();
          await p.pc.setLocalDescription(offer);
          await this.send(member.user_id, "offer", { type: offer.type, sdp: offer.sdp });
        });
    }
  }
  receive(signal: VoiceSignal) {
    if (!this.members.has(signal.sender_id)) return;
    this.enqueue(async () => {
      const p = this.createPeer(signal.sender_id);
      if (!p) return;
      if (signal.kind === "ice") {
        const candidate = signal.payload as RTCIceCandidateInit;
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(candidate);
        else p.candidates.push(candidate);
        return;
      }
      if (signal.kind === "offer" && this.userId < signal.sender_id) return; // Deterministic offerer avoids glare.
      await p.pc.setRemoteDescription(signal.payload as unknown as RTCSessionDescriptionInit);
      for (const candidate of p.candidates.splice(0)) await p.pc.addIceCandidate(candidate);
      if (signal.kind === "offer") {
        const answer = await p.pc.createAnswer();
        await p.pc.setLocalDescription(answer);
        await this.send(signal.sender_id, "answer", { type: answer.type, sdp: answer.sdp });
      }
    });
  }
  private enqueue(task: () => Promise<void>) {
    this.queue = this.queue
      .then(() => {
        if (!this.closed) return task();
        return undefined;
      })
      .catch(() => {
        if (!this.closed)
          this.callbacks.error(
            "Não foi possível negociar esta conexão. Confira a rede e entre novamente na chamada.",
          );
      });
  }
  resumeAudio() {
    void this.context?.resume();
    for (const p of this.peers.values()) void p.element.play().catch(() => {});
  }
  private dropPeer(id: string, p: Peer) {
    p.pc.ontrack = null;
    p.pc.onicecandidate = null;
    p.pc.onconnectionstatechange = null;
    p.pc.onicegatheringstatechange = null;
    p.pc.close();
    p.cleanupLevel?.();
    if (p.failureTimer) clearTimeout(p.failureTimer);
    p.element.pause();
    p.element.srcObject = null;
    this.peers.delete(id);
    this.callbacks.screen(id, null);
  }
  close() {
    this.closed = true;
    this.setMuted(true);
    this.stopSharing();
    this.localLevel?.();
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    for (const [id, p] of this.peers) this.dropPeer(id, p);
    void this.context?.close();
    this.context = null;
  }
}
