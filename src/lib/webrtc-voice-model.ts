import { supabase } from "@/integrations/supabase/client";

export function isVoiceFeatureEnabled(): boolean {
  const flag = import.meta.env.VITE_FEATURE_VOICE;
  return flag !== "false" && flag !== "0";
}

export const MAX_VOICE_PARTICIPANTS = 6;
export const CALL_INVITE_TIMEOUT_MS = 30_000;
export const DND_STORAGE_KEY = "gstudy_dnd_enabled";

export function isDndEnabled(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    return localStorage.getItem(DND_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setDndEnabled(enabled: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(DND_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage errors
  }
}

export interface CallInvite {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  roomId: string;
  roomTitle: string;
  createdAt: string;
  expiresAt: number;
}

export type VoicePeerState = {
  userId: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isDeafened?: boolean;
  isSharingScreen?: boolean;
};

export type VoiceCallbacks = {
  onSpeakingChange?: (userId: string, isSpeaking: boolean) => void;
  onVoiceStateChange?: (isMuted: boolean) => void;
  onDeafenChange?: (isDeafened: boolean) => void;
  onScreenShareChange?: (isSharing: boolean, stream: MediaStream | null) => void;
  onPeerStateChange?: (peerState: VoicePeerState) => void;
  onPeerTrack?: (remoteUserId: string, track: MediaStreamTrack, stream: MediaStream) => void;
  onError?: (err: Error) => void;
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export class StudyRoomVoiceMesh {
  private roomId: string;
  private userId: string;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private remoteAudioElements: HTMLAudioElement[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private isMuted = true; // SEMPRE inicia mutado por privacidade
  private isDeafened = false;
  private isSpeaking = false;
  private callbacks: VoiceCallbacks;
  private channel: ReturnType<typeof supabase.channel> | null = null;

  constructor(roomId: string, userId: string, callbacks: VoiceCallbacks = {}) {
    this.roomId = roomId;
    this.userId = userId;
    this.callbacks = callbacks;
  }

  public getMutedState(): boolean {
    return this.isMuted;
  }

  public getDeafenedState(): boolean {
    return this.isDeafened;
  }

  public getSpeakingState(): boolean {
    return this.isSpeaking;
  }

  public getScreenSharingState(): boolean {
    return Boolean(this.screenStream);
  }

  public getConnectedPeerCount(): number {
    return this.peers.size;
  }

  /**
   * Conecta à sala de sinalização Realtime
   */
  public async initSignaling(): Promise<void> {
    if (!isVoiceFeatureEnabled()) return;

    this.channel = supabase.channel(`room_voice_${this.roomId}`, {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on("broadcast", { event: "signal-offer" }, async ({ payload }) => {
        if (payload?.toUserId === this.userId) {
          await this.handleReceiveOffer(payload.fromUserId, payload.offer);
        }
      })
      .on("broadcast", { event: "signal-answer" }, async ({ payload }) => {
        if (payload?.toUserId === this.userId) {
          await this.handleReceiveAnswer(payload.fromUserId, payload.answer);
        }
      })
      .on("broadcast", { event: "signal-ice" }, async ({ payload }) => {
        if (payload?.toUserId === this.userId) {
          await this.handleReceiveCandidate(payload.fromUserId, payload.candidate);
        }
      })
      .on("broadcast", { event: "voice-state" }, ({ payload }) => {
        if (payload?.userId && payload.userId !== this.userId) {
          this.callbacks.onSpeakingChange?.(payload.userId, Boolean(payload.isSpeaking));
          this.callbacks.onPeerStateChange?.({
            userId: payload.userId,
            isMuted: Boolean(payload.isMuted),
            isSpeaking: Boolean(payload.isSpeaking),
            isDeafened: Boolean(payload.isDeafened),
            isSharingScreen: Boolean(payload.isSharingScreen),
          });
        }
      })
      .subscribe();
  }

  /**
   * Alterna estado do microfone (Mute / Unmute).
   * Solicita permissão do dispositivo SOMENTE na primeira vez que o usuário desmuta.
   */
  public async toggleMute(): Promise<boolean> {
    if (this.isMuted) {
      if (this.isDeafened) {
        // Desensurdecer ao desmutar
        this.isDeafened = false;
        this.callbacks.onDeafenChange?.(false);
        this.remoteAudioElements.forEach((el) => {
          el.muted = false;
        });
      }

      if (!this.localStream) {
        try {
          if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            throw new Error("Dispositivo de áudio não suportado neste navegador.");
          }
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
          this.setupAudioAnalyser();
        } catch (err) {
          const error = err instanceof Error ? err : new Error("Permissão de microfone negada.");
          this.callbacks.onError?.(error);
          return true; // permanece mutado
        }
      }

      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      this.isMuted = false;
    } else {
      // Mutar microfone
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      this.isMuted = true;
      this.isSpeaking = false;
      this.callbacks.onSpeakingChange?.(this.userId, false);
    }

    this.callbacks.onVoiceStateChange?.(this.isMuted);
    this.broadcastVoiceState();
    return this.isMuted;
  }

  /**
   * Alterna modo "Ensurdecer" (Deafen): silencia o microfone e todo áudio recebido.
   */
  public toggleDeafen(): boolean {
    this.isDeafened = !this.isDeafened;

    if (this.isDeafened) {
      // Muta microfone local
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      this.isMuted = true;
      this.isSpeaking = false;
      this.callbacks.onSpeakingChange?.(this.userId, false);
      this.callbacks.onVoiceStateChange?.(true);

      // Muta todos os áudios remotos
      this.remoteAudioElements.forEach((el) => {
        el.muted = true;
      });
    } else {
      // Desmuta áudios remotos
      this.remoteAudioElements.forEach((el) => {
        el.muted = false;
      });
    }

    this.callbacks.onDeafenChange?.(this.isDeafened);
    this.broadcastVoiceState();
    return this.isDeafened;
  }

  /**
   * Inicia compartilhamento de tela com getDisplayMedia
   */
  public async startScreenShare(): Promise<MediaStream | null> {
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Compartilhamento de tela não suportado neste navegador.");
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      this.screenStream = stream;
      const screenTrack = stream.getVideoTracks()[0];

      if (screenTrack) {
        screenTrack.onended = () => {
          this.stopScreenShare();
        };

        // Adiciona faixa de vídeo a todos os peers
        this.peers.forEach((pc) => {
          pc.addTrack(screenTrack, stream);
        });
      }

      this.callbacks.onScreenShareChange?.(true, stream);
      this.broadcastVoiceState();
      return stream;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Não foi possível compartilhar a tela.");
      this.callbacks.onError?.(error);
      return null;
    }
  }

  /**
   * Encerra o compartilhamento de tela
   */
  public stopScreenShare(): void {
    if (!this.screenStream) return;

    this.screenStream.getTracks().forEach((track) => track.stop());
    this.screenStream = null;

    this.callbacks.onScreenShareChange?.(false, null);
    this.broadcastVoiceState();
  }

  /**
   * Inicia conexão com um novo participante na sala (Mesh)
   * Limite máximo de 6 participantes na sala mesh
   */
  public async callPeer(remoteUserId: string): Promise<void> {
    if (this.peers.has(remoteUserId)) return;

    if (this.peers.size >= MAX_VOICE_PARTICIPANTS - 1) {
      const err = new Error("A chamada atingiu a capacidade máxima de 6 participantes.");
      this.callbacks.onError?.(err);
      return;
    }

    try {
      const pc = this.createPeerConnection(remoteUserId);
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream!));
      }
      if (this.screenStream) {
        this.screenStream.getTracks().forEach((track) => pc.addTrack(track, this.screenStream!));
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      void this.channel?.send({
        type: "broadcast",
        event: "signal-offer",
        payload: {
          fromUserId: this.userId,
          toUserId: remoteUserId,
          offer,
        },
      });
    } catch (err) {
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private createPeerConnection(remoteUserId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peers.set(remoteUserId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && this.channel) {
        void this.channel.send({
          type: "broadcast",
          event: "signal-ice",
          payload: {
            fromUserId: this.userId,
            toUserId: remoteUserId,
            candidate: event.candidate,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      const track = event.track;

      if (track.kind === "audio") {
        const remoteAudio = document.createElement("audio");
        remoteAudio.autoplay = true;
        remoteAudio.srcObject = stream;
        remoteAudio.muted = this.isDeafened;
        remoteAudio.style.display = "none";
        document.body.appendChild(remoteAudio);
        this.remoteAudioElements.push(remoteAudio);
      }

      this.callbacks.onPeerTrack?.(remoteUserId, track, stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        this.peers.delete(remoteUserId);
        pc.close();
      }
    };

    return pc;
  }

  private async handleReceiveOffer(
    fromUserId: string,
    offer: RTCSessionDescriptionInit,
  ): Promise<void> {
    if (this.peers.size >= MAX_VOICE_PARTICIPANTS - 1 && !this.peers.has(fromUserId)) {
      return;
    }

    let pc = this.peers.get(fromUserId);
    if (!pc) {
      pc = this.createPeerConnection(fromUserId);
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => pc!.addTrack(track, this.localStream!));
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => pc!.addTrack(track, this.screenStream!));
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    void this.channel?.send({
      type: "broadcast",
      event: "signal-answer",
      payload: {
        fromUserId: this.userId,
        toUserId: fromUserId,
        answer,
      },
    });
  }

  private async handleReceiveAnswer(
    fromUserId: string,
    answer: RTCSessionDescriptionInit,
  ): Promise<void> {
    const pc = this.peers.get(fromUserId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  private async handleReceiveCandidate(
    fromUserId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const pc = this.peers.get(fromUserId);
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Ignora erro eventual de candidato ICE recebido fora de ordem
      }
    }
  }

  private setupAudioAnalyser(): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx || !this.localStream) return;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!this.analyser || this.isMuted || this.isDeafened) {
          if (this.isSpeaking) {
            this.isSpeaking = false;
            this.callbacks.onSpeakingChange?.(this.userId, false);
            this.broadcastVoiceState();
          }
          this.animFrameId = requestAnimationFrame(checkVolume);
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const nowSpeaking = avg > 18; // limiar de fala em dB/amplitude

        if (nowSpeaking !== this.isSpeaking) {
          this.isSpeaking = nowSpeaking;
          this.callbacks.onSpeakingChange?.(this.userId, nowSpeaking);
          this.broadcastVoiceState();
        }

        this.animFrameId = requestAnimationFrame(checkVolume);
      };

      this.animFrameId = requestAnimationFrame(checkVolume);
    } catch {
      // Silencioso se AudioContext não estiver disponível
    }
  }

  private broadcastVoiceState(): void {
    void this.channel?.send({
      type: "broadcast",
      event: "voice-state",
      payload: {
        userId: this.userId,
        isMuted: this.isMuted,
        isDeafened: this.isDeafened,
        isSpeaking: this.isSpeaking,
        isSharingScreen: Boolean(this.screenStream),
      },
    });
  }

  /**
   * Finaliza todas as conexões peer, remove áudios e limpa o microfone
   */
  public disconnect(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }

    this.remoteAudioElements.forEach((el) => {
      el.remove();
    });
    this.remoteAudioElements = [];

    this.peers.forEach((pc) => {
      if (typeof pc?.close === "function") pc.close();
    });
    this.peers.clear();

    if (this.channel) {
      void supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  // --- Sistema de Convites de Chamada com Timeout e DND ---

  public static async sendCallInvite(
    fromUserId: string,
    fromUserName: string,
    toUserId: string,
    roomId: string,
    roomTitle: string,
  ): Promise<{ sent: boolean; reason?: string }> {
    const invite: CallInvite = {
      id: crypto.randomUUID(),
      fromUserId,
      fromUserName,
      toUserId,
      roomId,
      roomTitle,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + CALL_INVITE_TIMEOUT_MS,
    };

    const inviteChannel = supabase.channel(`call_invites_${toUserId}`);
    await inviteChannel.subscribe();

    await inviteChannel.send({
      type: "broadcast",
      event: "call-invite",
      payload: invite,
    });

    return { sent: true };
  }

  public static listenForCallInvites(
    userId: string,
    onInvite: (invite: CallInvite) => void,
  ): () => void {
    const channel = supabase.channel(`call_invites_${userId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "call-invite" }, ({ payload }) => {
        // Se usuário estiver em modo Não Perturbar, rejeita silenciosamente
        if (isDndEnabled()) {
          return;
        }

        const invite = payload as CallInvite;
        if (invite && invite.expiresAt > Date.now()) {
          onInvite(invite);
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }
}
