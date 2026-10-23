import React, { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Monitor,
  MonitorOff,
  PhoneOff,
  Users,
  PhoneCall,
  X,
  Check,
} from "lucide-react";
import {
  StudyRoomVoiceMesh,
  MAX_VOICE_PARTICIPANTS,
  type CallInvite,
  type VoicePeerState,
} from "@/lib/webrtc-voice-model";
import "@/styles/voice-call.css";

interface VoiceCallPanelProps {
  roomId: string;
  roomTitle: string;
  userId: string;
  userName: string;
  onDisconnect?: () => void;
}

export function VoiceCallPanel({
  roomId,
  roomTitle,
  userId,
  userName,
  onDisconnect,
}: VoiceCallPanelProps) {
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [peers, setPeers] = useState<Map<string, VoicePeerState>>(new Map());
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<CallInvite | null>(null);
  const [inviteSecondsLeft, setInviteSecondsLeft] = useState(30);

  const meshRef = useRef<StudyRoomVoiceMesh | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const mesh = new StudyRoomVoiceMesh(roomId, userId, {
      onSpeakingChange: (speakerId, speaking) => {
        if (speakerId === userId) {
          setIsSpeaking(speaking);
        } else {
          setPeers((prev) => {
            const next = new Map(prev);
            const peer = next.get(speakerId) || {
              userId: speakerId,
              isMuted: true,
              isSpeaking: false,
            };
            next.set(speakerId, { ...peer, isSpeaking: speaking });
            return next;
          });
        }
      },
      onVoiceStateChange: (muted) => setIsMuted(muted),
      onDeafenChange: (deafened) => setIsDeafened(deafened),
      onScreenShareChange: (sharing, stream) => {
        setIsSharingScreen(sharing);
        setScreenStream(stream);
      },
      onPeerStateChange: (peerState) => {
        setPeers((prev) => {
          const next = new Map(prev);
          next.set(peerState.userId, peerState);
          return next;
        });
      },
    });

    meshRef.current = mesh;
    void mesh.initSignaling();

    // Listen for call invites
    const unsubscribeInvites = StudyRoomVoiceMesh.listenForCallInvites(userId, (invite) => {
      setIncomingInvite(invite);
      setInviteSecondsLeft(30);
    });

    return () => {
      mesh.disconnect();
      unsubscribeInvites();
    };
  }, [roomId, userId]);

  // Video element preview for screen share
  useEffect(() => {
    if (videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // Countdown timer for incoming invite
  useEffect(() => {
    if (!incomingInvite) return;
    const interval = setInterval(() => {
      setInviteSecondsLeft((prev) => {
        if (prev <= 1) {
          setIncomingInvite(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [incomingInvite]);

  const handleToggleMute = async () => {
    if (meshRef.current) {
      const muted = await meshRef.current.toggleMute();
      setIsMuted(muted);
    }
  };

  const handleToggleDeafen = () => {
    if (meshRef.current) {
      const deafened = meshRef.current.toggleDeafen();
      setIsDeafened(deafened);
    }
  };

  const handleToggleScreenShare = async () => {
    if (!meshRef.current) return;
    if (isSharingScreen) {
      meshRef.current.stopScreenShare();
      setIsSharingScreen(false);
      setScreenStream(null);
    } else {
      const stream = await meshRef.current.startScreenShare();
      if (stream) {
        setIsSharingScreen(true);
        setScreenStream(stream);
      }
    }
  };

  const handleDisconnect = () => {
    meshRef.current?.disconnect();
    onDisconnect?.();
  };

  const totalParticipants = (peers.size || 0) + 1;

  return (
    <div className="voice-call-wrapper" role="region" aria-label="Chamada de voz da sala">
      <div className="voice-call-bar">
        <div className="voice-status-group">
          <span className="voice-pulse-dot" aria-label="Chamada ativa" />
          <div>
            <p className="font-serif font-bold text-sm text-foreground">{roomTitle}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users size={12} />
              <span>
                {totalParticipants} / {MAX_VOICE_PARTICIPANTS} participantes (Mesh P2P)
              </span>
            </p>
          </div>
        </div>

        <div className="voice-controls">
          <button
            type="button"
            className={`voice-ctrl-btn ${isMuted ? "is-muted" : "is-active"}`}
            onClick={handleToggleMute}
            aria-label={isMuted ? "Desmutar microfone" : "Mutar microfone"}
            title={isMuted ? "Desmutar" : "Mutar"}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            <span>{isMuted ? "Mutado" : "Falando"}</span>
          </button>

          <button
            type="button"
            className={`voice-ctrl-btn ${isDeafened ? "is-deafened" : ""}`}
            onClick={handleToggleDeafen}
            aria-label={isDeafened ? "Reativar áudio" : "Ensurdecer"}
            title={isDeafened ? "Reativar áudio" : "Ensurdecer"}
          >
            {isDeafened ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>

          <button
            type="button"
            className={`voice-ctrl-btn ${isSharingScreen ? "is-active" : ""}`}
            onClick={handleToggleScreenShare}
            aria-label={isSharingScreen ? "Parar tela" : "Compartilhar tela"}
            title={isSharingScreen ? "Parar tela" : "Compartilhar tela"}
          >
            {isSharingScreen ? <MonitorOff size={18} /> : <Monitor size={18} />}
          </button>

          <button
            type="button"
            className="voice-ctrl-btn is-disconnect"
            onClick={handleDisconnect}
            aria-label="Sair da chamada"
            title="Sair da chamada"
          >
            <PhoneOff size={18} />
          </button>
        </div>
      </div>

      {/* Participants list */}
      <div className="voice-participants-list" aria-label="Participantes conectados">
        {/* Local user */}
        <div
          className={`voice-peer-chip ${isSpeaking ? "is-speaking" : ""}`}
          aria-label={`Você (${userName}) ${isSpeaking ? "- falando" : ""}`}
        >
          {isMuted ? <MicOff size={13} className="text-destructive" /> : <Mic size={13} />}
          <span>
            {userName} <b>(Você)</b>
          </span>
        </div>

        {/* Remote peers */}
        {Array.from(peers.values()).map((peer) => (
          <div
            key={peer.userId}
            className={`voice-peer-chip ${peer.isSpeaking ? "is-speaking" : ""}`}
          >
            {peer.isMuted ? (
              <MicOff size={13} className="text-destructive" />
            ) : (
              <Mic size={13} className="text-primary" />
            )}
            <span>Participante</span>
          </div>
        ))}
      </div>

      {/* Screen Share Preview */}
      {isSharingScreen && screenStream && (
        <div className="voice-screen-preview">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="voice-screen-video"
            aria-label="Compartilhamento de tela ativo"
          />
        </div>
      )}

      {/* Incoming Call Notification (30s timeout) */}
      {incomingInvite && (
        <div
          className="incoming-call-modal"
          role="alertdialog"
          aria-modal="true"
          aria-label="Convite para chamada de voz"
        >
          <div className="incoming-call-header">
            <span className="p-2 rounded-full bg-primary/20 text-primary">
              <PhoneCall size={20} />
            </span>
            <div>
              <p className="font-serif font-bold text-sm text-foreground">
                {incomingInvite.fromUserName} está chamando!
              </p>
              <p className="text-xs text-muted-foreground">{incomingInvite.roomTitle}</p>
            </div>
          </div>

          <div className="incoming-call-timer-bar">
            <div
              className="incoming-call-timer-fill"
              style={{ width: `${(inviteSecondsLeft / 30) * 100}%` }}
            />
          </div>

          <div className="incoming-call-actions">
            <button
              type="button"
              className="incoming-call-btn-accept"
              onClick={() => {
                setIncomingInvite(null);
                window.location.href = `/salas?room=${incomingInvite.roomId}`;
              }}
            >
              <Check size={16} />
              <span>Aceitar ({inviteSecondsLeft}s)</span>
            </button>
            <button
              type="button"
              className="incoming-call-btn-reject"
              onClick={() => setIncomingInvite(null)}
            >
              <X size={16} />
              <span>Recusar</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
