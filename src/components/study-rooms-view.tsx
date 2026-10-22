import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Lock,
  Globe,
  PlusCircle,
  LogOut,
  CheckCircle2,
  Circle,
  Coffee,
  Brain,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "./auth-gate";
import { Avatar } from "./avatar";
import { isSocialFeatureEnabled } from "@/lib/social-model";
import {
  listAvailableRooms,
  getRoomDetails,
  createStudyRoom,
  joinRoom,
  leaveRoom,
  listRoomParticipants,
  updateMyGoal,
  updatePomodoroState,
  type StudyRoom,
  type RoomParticipant,
  type PomodoroState,
} from "@/lib/study-rooms-model";
import "@/styles/study-rooms.css";

export function StudyRoomsView({ initialRoomId }: { initialRoomId?: string }) {
  const { user } = useAuth();
  const [activeRoomId, setActiveRoomId] = useState<string | null>(initialRoomId ?? null);
  const [filter, setFilter] = useState<"all" | "friends" | "groups">("all");
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<StudyRoom | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomTopic, setRoomTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState(8);

  // In-room goal editing
  const [myGoalInput, setMyGoalInput] = useState("");

  // Pomodoro local tick
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const loadRooms = useCallback(async () => {
    if (!user?.id || !isSocialFeatureEnabled()) return;
    setLoading(true);
    try {
      const data = await listAvailableRooms(user.id, filter);
      setRooms(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, filter]);

  const loadRoomContent = useCallback(
    async (roomId: string) => {
      if (!isSocialFeatureEnabled()) return;
      try {
        const [details, parts] = await Promise.all([
          getRoomDetails(roomId),
          listRoomParticipants(roomId),
        ]);
        setActiveRoom(details);
        setParticipants(parts);

        const me = parts.find((p) => p.userId === user?.id);
        if (me?.currentGoal) {
          setMyGoalInput(me.currentGoal);
        }
      } catch (err) {
        console.error(err);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    if (activeRoomId) {
      void loadRoomContent(activeRoomId);
      const interval = setInterval(() => {
        void loadRoomContent(activeRoomId);
      }, 5000);
      return () => clearInterval(interval);
    } else {
      void loadRooms();
    }
  }, [activeRoomId, loadRooms, loadRoomContent]);

  // Pomodoro local countdown timer
  useEffect(() => {
    if (activeRoom?.pomodoroState.is_running) {
      timerRef.current = setInterval(() => {
        setActiveRoom((prev) => {
          if (!prev || !prev.pomodoroState.is_running) return prev;
          const currentSecs = prev.pomodoroState.remaining_seconds;
          if (currentSecs <= 1) {
            // Mode transition: work -> break, or break -> work
            const nextMode = prev.pomodoroState.mode === "work" ? "break" : "work";
            const nextSecs = nextMode === "work" ? 1500 : 300;
            toast.info(
              nextMode === "break"
                ? "Tempo de foco concluído! Hora da pausa de 5 minutos."
                : "Pausa encerrada! De volta ao foco de 25 minutos.",
            );
            return {
              ...prev,
              pomodoroState: {
                mode: nextMode,
                remaining_seconds: nextSecs,
                is_running: true,
              },
            };
          }
          return {
            ...prev,
            pomodoroState: {
              ...prev.pomodoroState,
              remaining_seconds: currentSecs - 1,
            },
          };
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeRoom?.pomodoroState.is_running, activeRoom?.pomodoroState.mode]);

  if (!isSocialFeatureEnabled()) {
    return null;
  }

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !roomName.trim()) return;

    try {
      const room = await createStudyRoom(user.id, {
        name: roomName,
        topic: roomTopic,
        isPrivate,
        maxParticipants,
      });
      toast.success("Sala de estudo criada!");
      setShowCreateModal(false);
      setRoomName("");
      setRoomTopic("");
      setActiveRoomId(room.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar sala.");
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    if (!user?.id) return;
    try {
      await joinRoom(roomId, user.id);
      setActiveRoomId(roomId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar na sala.");
    }
  };

  const handleLeaveRoom = async () => {
    if (!user?.id || !activeRoomId) return;
    try {
      await leaveRoom(activeRoomId, user.id);
      setActiveRoomId(null);
      setActiveRoom(null);
      void loadRooms();
    } catch (err) {
      console.error(err);
      setActiveRoomId(null);
    }
  };

  const handleTogglePomodoro = async () => {
    if (!activeRoom) return;
    const nextState: PomodoroState = {
      ...activeRoom.pomodoroState,
      is_running: !activeRoom.pomodoroState.is_running,
    };
    setActiveRoom({ ...activeRoom, pomodoroState: nextState });
    try {
      await updatePomodoroState(activeRoom.id, nextState);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetPomodoro = async () => {
    if (!activeRoom) return;
    const defaultSecs = activeRoom.pomodoroState.mode === "work" ? 1500 : 300;
    const nextState: PomodoroState = {
      ...activeRoom.pomodoroState,
      remaining_seconds: defaultSecs,
      is_running: false,
    };
    setActiveRoom({ ...activeRoom, pomodoroState: nextState });
    try {
      await updatePomodoroState(activeRoom.id, nextState);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSwitchMode = async () => {
    if (!activeRoom) return;
    const nextMode = activeRoom.pomodoroState.mode === "work" ? "break" : "work";
    const nextSecs = nextMode === "work" ? 1500 : 300;
    const nextState: PomodoroState = {
      mode: nextMode,
      remaining_seconds: nextSecs,
      is_running: false,
    };
    setActiveRoom({ ...activeRoom, pomodoroState: nextState });
    try {
      await updatePomodoroState(activeRoom.id, nextState);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !activeRoomId || !myGoalInput.trim()) return;

    try {
      await updateMyGoal(activeRoomId, user.id, myGoalInput, false);
      toast.success("Meta atualizada!");
      void loadRoomContent(activeRoomId);
    } catch (err) {
      toast.error("Erro ao salvar meta.");
    }
  };

  const handleToggleGoalCompleted = async (part: RoomParticipant) => {
    if (!user?.id || !activeRoomId || part.userId !== user.id) return;
    const nextCompleted = !part.isGoalCompleted;
    try {
      await updateMyGoal(activeRoomId, user.id, part.currentGoal || "", nextCompleted);
      setParticipants((prev) =>
        prev.map((p) => (p.userId === user.id ? { ...p, isGoalCompleted: nextCompleted } : p)),
      );
      if (nextCompleted) {
        toast.success("Parabéns por atingir sua meta de foco!");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // View: In-room view
  if (activeRoomId && activeRoom) {
    const isWork = activeRoom.pomodoroState.mode === "work";
    const myParticipant = participants.find((p) => p.userId === user?.id);

    return (
      <div className="room-view">
        <div className="room-topbar">
          <div>
            <h1 style={{ fontSize: 24, margin: "0 0 4px", color: "#2f4a3a" }}>{activeRoom.name}</h1>
            {activeRoom.topic && <span className="room-card-topic">{activeRoom.topic}</span>}
          </div>

          <button type="button" className="social-btn social-btn-danger" onClick={handleLeaveRoom}>
            <LogOut size={16} /> Sair da Sala
          </button>
        </div>

        {/* Central Synchronized Pomodoro */}
        <div className="room-pomodoro-card">
          <div className="room-pomodoro-mode">
            {isWork ? (
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#2f4a3a" }}
              >
                <Brain size={16} /> Bloco de Foco (25 min)
              </span>
            ) : (
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#f57c00" }}
              >
                <Coffee size={16} /> Intervalo (5 min)
              </span>
            )}
          </div>

          <div className="room-pomodoro-timer">
            {formatTime(activeRoom.pomodoroState.remaining_seconds)}
          </div>

          <div className="room-pomodoro-controls">
            <button
              type="button"
              className="social-btn social-btn-primary"
              onClick={handleTogglePomodoro}
            >
              {activeRoom.pomodoroState.is_running ? (
                <>
                  <Pause size={16} /> Pausar
                </>
              ) : (
                <>
                  <Play size={16} /> Iniciar Foco
                </>
              )}
            </button>

            <button
              type="button"
              className="social-btn"
              onClick={handleResetPomodoro}
              title="Reiniciar tempo"
            >
              <RotateCcw size={16} /> Reiniciar
            </button>

            <button
              type="button"
              className="social-btn"
              onClick={handleSwitchMode}
              title="Alternar entre foco e pausa"
            >
              Alternar para {isWork ? "Pausa" : "Foco"}
            </button>
          </div>
        </div>

        {/* My Goal Form */}
        <div
          style={{
            background: "#fffdfa",
            padding: 16,
            borderRadius: 12,
            marginBottom: 24,
            border: "1px solid rgba(108,88,76,0.18)",
          }}
        >
          <form onSubmit={handleSaveGoal} style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              placeholder="Defina sua meta nesta sessão (ex: Resolver 10 questões de Biologia)..."
              value={myGoalInput}
              onChange={(e) => setMyGoalInput(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid rgba(108,88,76,0.25)",
                fontSize: 14,
              }}
            />
            <button type="submit" className="social-btn social-btn-primary">
              Salvar Meta
            </button>
          </form>
        </div>

        {/* Participants Grid */}
        <h2 style={{ fontSize: 18, marginBottom: 14, color: "#2f4a3a" }}>
          Estudando Agora ({participants.length}/{activeRoom.maxParticipants})
        </h2>

        <div className="room-participants-grid">
          {participants.map((p) => {
            const isMe = p.userId === user?.id;
            return (
              <div key={p.userId} className="participant-card">
                <div className="participant-header">
                  <div className="avatar-halo">
                    <Avatar url={p.avatarUrl} name={p.displayName ?? "Aluno"} size={42} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#2c2523" }}>
                      {p.displayName} {isMe && "(Você)"}
                    </h4>
                    <span style={{ fontSize: 12, color: "#8c7365" }}>@{p.username}</span>
                  </div>
                </div>

                <div
                  className={`participant-goal-box ${p.isGoalCompleted ? "completed" : ""}`}
                  style={{ cursor: isMe ? "pointer" : "default" }}
                  onClick={() => {
                    if (isMe) void handleToggleGoalCompleted(p);
                  }}
                  title={isMe ? "Clique para marcar como concluída" : undefined}
                >
                  {isMe ? (
                    p.isGoalCompleted ? (
                      <CheckCircle2 size={16} color="#2e7d32" style={{ flexShrink: 0 }} />
                    ) : (
                      <Circle size={16} color="#8c7365" style={{ flexShrink: 0 }} />
                    )
                  ) : (
                    <Sparkles size={16} color="#8c7365" style={{ flexShrink: 0 }} />
                  )}
                  <span>{p.currentGoal || "Sem meta definida ainda"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // View: Room directory view
  return (
    <div className="rooms-container">
      <div className="rooms-header">
        <div className="rooms-header-title">
          <h1>Salas de Estudo ao Vivo</h1>
          <p>Estude em tempo real com amigos e colegas com Pomodoro compartilhado.</p>
        </div>

        <button
          type="button"
          className="social-btn social-btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          <PlusCircle size={16} /> Criar Sala de Estudo
        </button>
      </div>

      <div className="rooms-filters">
        <button
          type="button"
          className={`rooms-filter-btn ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          Todas as salas
        </button>
        <button
          type="button"
          className={`rooms-filter-btn ${filter === "friends" ? "active" : ""}`}
          onClick={() => setFilter("friends")}
        >
          Salas com amigos
        </button>
        <button
          type="button"
          className={`rooms-filter-btn ${filter === "groups" ? "active" : ""}`}
          onClick={() => setFilter("groups")}
        >
          Meus grupos
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="social-empty-state">
          <h3>Nenhuma sala de estudo aberta no momento</h3>
          <p>Crie uma sala agora e convide seus amigos para manterem o foco juntos.</p>
          <button
            type="button"
            className="social-btn social-btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => setShowCreateModal(true)}
          >
            <PlusCircle size={16} /> Criar a primeira sala
          </button>
        </div>
      ) : (
        <div className="rooms-grid">
          {rooms.map((room) => (
            <div key={room.id} className="room-card">
              <div className="room-card-header">
                <div className="room-card-title">
                  <h3>{room.name}</h3>
                  {room.topic && <span className="room-card-topic">{room.topic}</span>}
                </div>
                {room.isPrivate ? (
                  <Lock size={16} color="#8c7365" title="Sala privada para amigos ou grupo" />
                ) : (
                  <Globe size={16} color="#2f4a3a" title="Sala aberta" />
                )}
              </div>

              <div className="room-card-footer">
                <div className="room-card-participants">
                  <Users size={15} />
                  <span>Até {room.maxParticipants} participantes</span>
                </div>

                <button
                  type="button"
                  className="social-btn social-btn-primary"
                  onClick={() => handleJoinRoom(room.id)}
                >
                  Entrar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar Sala */}
      {showCreateModal && (
        <div className="social-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="social-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Criar Sala de Estudo</h2>
            <p>Salas ao vivo têm Pomodoro sincronizado e metas individuais visíveis.</p>
            <form onSubmit={handleCreateRoom}>
              <div className="social-modal-field">
                <label>Nome da sala:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Foco Total · Redação ENEM"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                />
              </div>

              <div className="social-modal-field">
                <label>Matéria ou Foco (opcional):</label>
                <input
                  type="text"
                  placeholder="Ex: Matemática, Física, Redação"
                  value={roomTopic}
                  onChange={(e) => setRoomTopic(e.target.value)}
                />
              </div>

              <div className="social-modal-field">
                <label>Limite de pessoas (2 a 16):</label>
                <input
                  type="number"
                  min={2}
                  max={16}
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(Number(e.target.value))}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0" }}>
                <input
                  type="checkbox"
                  id="private-check"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                />
                <label
                  htmlFor="private-check"
                  style={{ fontSize: 13, color: "#493729", cursor: "pointer" }}
                >
                  Sala privada (apenas amigos aceitos podem ver e entrar)
                </label>
              </div>

              <div className="social-modal-actions">
                <button
                  type="button"
                  className="social-btn"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="social-btn social-btn-primary">
                  Criar e Entrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
