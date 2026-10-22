import { supabase } from "@/integrations/supabase/client";

export function isVoiceFeatureEnabled(): boolean {
  const flag = import.meta.env.VITE_FEATURE_VOICE;
  return flag === "true" || flag === "1";
}

export type VoicePeerState = {
  userId: string;
  isMuted: boolean;
  isSpeaking: boolean;
};

export type VoiceCallbacks = {
  onSpeakingChange?: (userId: string, isSpeaking: boolean) => void;
  onVoiceStateChange?: (isMuted: boolean) => void;
  onPeerStateChange?: (peerState: VoicePeerState) => void;
  onError?: (err: Error) => void;
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export class StudyRoomVoiceMesh {
  private roomId: string;
  private userId: string;
  private localStream: MediaStream | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private isMuted = true; // SEMPRE inicia mutado por privacidade
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

  public getSpeakingState(): boolean {
    return this.isSpeaking;
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
      // O usuário quer desmutar: adquire o stream se ainda não possuir
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
   * Inicia conexão com um novo participante na sala (Mesh)
   */
  public async callPeer(remoteUserId: string): Promise<void> {
    if (this.peers.has(remoteUserId)) return;

    try {
      const pc = this.createPeerConnection(remoteUserId);
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream!));
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
      // Cria elemento de áudio remoto invisível
      const remoteAudio = document.createElement("audio");
      remoteAudio.autoplay = true;
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.style.display = "none";
      document.body.appendChild(remoteAudio);
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
    let pc = this.peers.get(fromUserId);
    if (!pc) {
      pc = this.createPeerConnection(fromUserId);
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => pc!.addTrack(track, this.localStream!));
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
        if (!this.analyser || this.isMuted) {
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
        isSpeaking: this.isSpeaking,
      },
    });
  }

  /**
   * Finaliza todas as conexões peer e limpa o microfone
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

    this.peers.forEach((pc) => pc.close());
    this.peers.clear();

    if (this.channel) {
      void supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
