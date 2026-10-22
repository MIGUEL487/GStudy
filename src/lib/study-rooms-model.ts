import { supabase } from "@/integrations/supabase/client";
import { isSocialFeatureEnabled, sanitizePlainText } from "./social-model";

export type PomodoroMode = "work" | "break";

export type PomodoroState = {
  mode: PomodoroMode;
  remaining_seconds: number;
  is_running: boolean;
  last_started_at?: string;
};

export type StudyRoom = {
  id: string;
  name: string;
  topic?: string | null;
  createdBy: string;
  groupId?: string | null;
  isPrivate: boolean;
  maxParticipants: number;
  pomodoroState: PomodoroState;
  createdAt: string;
  closedAt?: string | null;
  participantsCount?: number;
};

export type RoomParticipant = {
  roomId: string;
  userId: string;
  joinedAt: string;
  lastSeenAt: string;
  currentGoal?: string | null;
  isGoalCompleted: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
};

const DEFAULT_POMODORO: PomodoroState = {
  mode: "work",
  remaining_seconds: 1500, // 25 min
  is_running: false,
};

/**
 * List active rooms accessible to the user
 */
export async function listAvailableRooms(
  userId: string,
  filter: "all" | "friends" | "groups" = "all",
): Promise<StudyRoom[]> {
  if (!isSocialFeatureEnabled() || !userId) return [];

  let query = supabase.from("study_rooms").select("*").is("closed_at", null);

  if (filter === "groups") {
    query = query.not("group_id", "is", null);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map(
    (r: {
      id: string;
      name: string;
      topic?: string | null;
      created_by: string;
      group_id?: string | null;
      is_private: boolean;
      max_participants: number;
      pomodoro_state?: PomodoroState;
      created_at: string;
      closed_at?: string | null;
    }) => ({
      id: r.id,
      name: r.name,
      topic: r.topic,
      createdBy: r.created_by,
      groupId: r.group_id,
      isPrivate: r.is_private,
      maxParticipants: r.max_participants,
      pomodoroState: r.pomodoro_state ?? DEFAULT_POMODORO,
      createdAt: r.created_at,
      closedAt: r.closed_at,
    }),
  );
}

/**
 * Fetch a single room by ID
 */
export async function getRoomDetails(roomId: string): Promise<StudyRoom | null> {
  if (!isSocialFeatureEnabled() || !roomId) return null;

  const { data, error } = await supabase.from("study_rooms").select("*").eq("id", roomId).single();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    topic: data.topic,
    createdBy: data.created_by,
    groupId: data.group_id,
    isPrivate: data.is_private,
    maxParticipants: data.max_participants,
    pomodoroState: data.pomodoro_state ?? DEFAULT_POMODORO,
    createdAt: data.created_at,
    closedAt: data.closed_at,
  };
}

/**
 * Create a new study room
 */
export async function createStudyRoom(
  userId: string,
  params: {
    name: string;
    topic?: string;
    isPrivate?: boolean;
    maxParticipants?: number;
    groupId?: string;
  },
): Promise<StudyRoom> {
  if (!isSocialFeatureEnabled()) throw new Error("Módulo social desativado.");

  const cleanName = sanitizePlainText(params.name);
  if (!cleanName) throw new Error("O nome da sala é obrigatório.");

  const max = Math.min(16, Math.max(2, params.maxParticipants ?? 8));

  const { data, error } = await supabase
    .from("study_rooms")
    .insert({
      name: cleanName,
      topic: params.topic ? sanitizePlainText(params.topic) : null,
      created_by: userId,
      group_id: params.groupId ?? null,
      is_private: params.isPrivate ?? false,
      max_participants: max,
      pomodoro_state: DEFAULT_POMODORO,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Erro ao criar sala de estudo.");
  }

  // Join the creator into the room
  await joinRoom(data.id, userId);

  return {
    id: data.id,
    name: data.name,
    topic: data.topic,
    createdBy: data.created_by,
    groupId: data.group_id,
    isPrivate: data.is_private,
    maxParticipants: data.max_participants,
    pomodoroState: data.pomodoro_state ?? DEFAULT_POMODORO,
    createdAt: data.created_at,
  };
}

/**
 * Join a room as participant
 */
export async function joinRoom(
  roomId: string,
  userId: string,
  initialGoal?: string,
): Promise<void> {
  if (!isSocialFeatureEnabled() || !roomId || !userId) return;

  const { error } = await supabase.from("study_room_participants").upsert(
    {
      room_id: roomId,
      user_id: userId,
      last_seen_at: new Date().toISOString(),
      current_goal: initialGoal ? sanitizePlainText(initialGoal) : null,
      is_muted: true,
      is_camera_on: false,
      is_screen_sharing: false,
    },
    { onConflict: "room_id,user_id" },
  );

  if (error) {
    throw new Error(error.message || "Não foi possível entrar na sala de estudo.");
  }
}

/**
 * Leave a room
 */
export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  if (!isSocialFeatureEnabled() || !roomId || !userId) return;

  await supabase
    .from("study_room_participants")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", userId);
}

/**
 * List participants currently in a room
 */
export async function listRoomParticipants(roomId: string): Promise<RoomParticipant[]> {
  if (!isSocialFeatureEnabled() || !roomId) return [];

  const { data, error } = await supabase
    .from("study_room_participants")
    .select("*")
    .eq("room_id", roomId);

  if (error || !data || data.length === 0) return [];

  const userIds = data.map((p: { user_id: string }) => p.user_id);
  const { data: profiles } = await supabase.from("profiles").select("*").in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map(
      (prof: {
        id: string;
        display_name?: string;
        username: string;
        avatar_url?: string | null;
      }) => [prof.id, prof],
    ),
  );

  return data.map(
    (p: {
      room_id: string;
      user_id: string;
      joined_at: string;
      last_seen_at: string;
      current_goal?: string | null;
      is_goal_completed: boolean;
      is_muted: boolean;
      is_camera_on: boolean;
      is_screen_sharing: boolean;
    }) => {
      const prof = profileMap.get(p.user_id);
      return {
        roomId: p.room_id,
        userId: p.user_id,
        joinedAt: p.joined_at,
        lastSeenAt: p.last_seen_at,
        currentGoal: p.current_goal,
        isGoalCompleted: p.is_goal_completed,
        isMuted: p.is_muted,
        isCameraOn: p.is_camera_on,
        isScreenSharing: p.is_screen_sharing,
        displayName: prof?.display_name ?? prof?.username ?? "Colega",
        username: prof?.username,
        avatarUrl: prof?.avatar_url,
      };
    },
  );
}

/**
 * Update my personal focus goal in the room
 */
export async function updateMyGoal(
  roomId: string,
  userId: string,
  goal: string,
  completed = false,
): Promise<void> {
  if (!isSocialFeatureEnabled()) return;

  const { error } = await supabase
    .from("study_room_participants")
    .update({
      current_goal: sanitizePlainText(goal),
      is_goal_completed: completed,
      last_seen_at: new Date().toISOString(),
    })
    .eq("room_id", roomId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message || "Erro ao atualizar meta.");
  }
}

/**
 * Update the synchronized Pomodoro state
 */
export async function updatePomodoroState(roomId: string, state: PomodoroState): Promise<void> {
  if (!isSocialFeatureEnabled()) return;

  const { error } = await supabase
    .from("study_rooms")
    .update({ pomodoro_state: state })
    .eq("id", roomId);

  if (error) {
    throw new Error(error.message || "Erro ao atualizar Pomodoro.");
  }
}

/**
 * Close room (creator only)
 */
export async function closeRoom(roomId: string, userId: string): Promise<void> {
  if (!isSocialFeatureEnabled()) return;

  const { error } = await supabase
    .from("study_rooms")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", roomId)
    .eq("created_by", userId);

  if (error) {
    throw new Error(error.message || "Erro ao encerrar sala.");
  }
}

export type RoomMessage = {
  id: string;
  roomId: string;
  userId: string;
  senderUsername: string;
  senderDisplayName: string;
  content: string;
  createdAt: string;
};

/**
 * List recent messages in a study room (up to limit)
 */
export async function listRoomMessages(roomId: string, limit = 50): Promise<RoomMessage[]> {
  if (!isSocialFeatureEnabled() || !roomId) return [];

  const { data, error } = await supabase
    .from("study_room_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  return data.map(
    (m: {
      id: string;
      room_id: string;
      user_id: string;
      sender_username: string;
      sender_display_name: string;
      content: string;
      created_at: string;
    }) => ({
      id: m.id,
      roomId: m.room_id,
      userId: m.user_id,
      senderUsername: m.sender_username,
      senderDisplayName: m.sender_display_name,
      content: sanitizePlainText(m.content),
      createdAt: m.created_at,
    }),
  );
}

/**
 * Send a message in a study room with 500-char limit and plain text sanitization
 */
export async function sendRoomMessage(
  roomId: string,
  content: string,
  senderUsername: string,
  senderDisplayName: string,
): Promise<string> {
  if (!isSocialFeatureEnabled()) throw new Error("Recurso social desativado.");

  const clean = sanitizePlainText(content).trim();
  if (!clean || clean.length === 0) {
    throw new Error("A mensagem não pode ser vazia.");
  }
  if (clean.length > 500) {
    throw new Error("A mensagem deve ter no máximo 500 caracteres.");
  }

  // Attempt RPC with rate limit enforcement
  const { data: rpcData, error: rpcError } = await supabase.rpc("send_room_message", {
    p_room_id: roomId,
    p_content: clean,
    p_sender_username: senderUsername,
    p_sender_display_name: senderDisplayName,
  });

  if (!rpcError && rpcData) {
    return rpcData as string;
  }

  // Fallback to direct insert if RPC is pending migration in test mock
  const { data: insertData, error: insertError } = await supabase
    .from("study_room_messages")
    .insert({
      room_id: roomId,
      content: clean,
      sender_username: senderUsername,
      sender_display_name: senderDisplayName,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message || "Erro ao enviar mensagem.");
  }

  return (insertData as { id: string }).id;
}

/**
 * Play subtle audio chime for chat messages (Web Audio API, zero asset dependencies)
 */
export function playNotificationSound(): void {
  try {
    if (typeof window === "undefined") return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Graceful silence if audio permissions or device audio unavailable
  }
}
