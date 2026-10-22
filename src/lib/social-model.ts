import { supabase } from "@/integrations/supabase/client";

export type UserStatus = "online" | "offline" | "studying" | "busy";

export type UserProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  status: UserStatus;
  bio?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type FriendshipStatus = "pending" | "accepted" | "blocked";

export type Friendship = {
  id: string;
  userId: string;
  friendId: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
  profile?: UserProfile;
};

export type StudyGroup = {
  id: string;
  name: string;
  description?: string | null;
  createdBy: string;
  isPrivate: boolean;
  inviteCode: string;
  createdAt: string;
  role?: "admin" | "member";
  membersCount?: number;
};

export type GroupMember = {
  groupId: string;
  userId: string;
  role: "admin" | "member";
  joinedAt: string;
  profile?: UserProfile;
};

export type SearchUserResult = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
};

/**
 * Check if the social module feature flag is active
 */
export function isSocialFeatureEnabled(): boolean {
  const flag = import.meta.env.VITE_FEATURE_SOCIAL;
  return flag !== "false" && flag !== "0";
}

/**
 * Helper to ensure plain text without any HTML formatting
 */
export function sanitizePlainText(input: string): string {
  return input.replace(/[<>]/g, "").trim();
}

/**
 * Exact user search by @username or email via security definer RPC
 */
export async function searchUserExact(query: string): Promise<SearchUserResult | null> {
  if (!isSocialFeatureEnabled()) return null;

  const clean = sanitizePlainText(query);
  if (!clean) return null;

  const { data, error } = await supabase.rpc("search_user_exact", {
    query_term: clean,
  });

  if (error) {
    if (error.message.includes("Limite de buscas excedido")) {
      throw new Error("Limite de 10 buscas por minuto atingido. Aguarde um instante.");
    }
    throw new Error(error.message || "Erro ao buscar usuário.");
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return null;
  }

  const result = Array.isArray(data) ? data[0] : data;
  return {
    id: result.id,
    username: result.username,
    displayName: result.display_name ?? result.username,
    avatarUrl: result.avatar_url,
  };
}

/**
 * List accepted friends
 */
export async function listFriends(userId: string): Promise<Friendship[]> {
  if (!isSocialFeatureEnabled() || !userId) return [];

  const { data, error } = await supabase
    .from("friendships")
    .select(
      `
      id,
      user_id,
      friend_id,
      status,
      created_at,
      updated_at
    `,
    )
    .eq("status", "accepted")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  if (error) {
    console.error("Erro ao listar amigos:", error);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Fetch profiles for friends
  const friendIds = data.map((f: { user_id: string; friend_id: string }) =>
    f.user_id === userId ? f.friend_id : f.user_id,
  );

  const { data: profiles } = await supabase.from("profiles").select("*").in("id", friendIds);

  const profileMap = new Map((profiles ?? []).map((p: UserProfile) => [p.id, p]));

  return data.map(
    (f: {
      id: string;
      user_id: string;
      friend_id: string;
      status: FriendshipStatus;
      created_at: string;
      updated_at: string;
    }) => {
      const friendId = f.user_id === userId ? f.friend_id : f.user_id;
      const prof = profileMap.get(friendId);
      return {
        id: f.id,
        userId: f.user_id,
        friendId: f.friend_id,
        status: f.status,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
        profile: prof
          ? {
              id: prof.id,
              username: prof.username,
              displayName: prof.displayName || prof.username,
              avatarUrl: prof.avatarUrl,
              status: prof.status,
              bio: prof.bio,
            }
          : undefined,
      };
    },
  );
}

/**
 * List pending friend requests (received and sent)
 */
export async function listPendingRequests(
  userId: string,
): Promise<{ incoming: Friendship[]; outgoing: Friendship[] }> {
  if (!isSocialFeatureEnabled() || !userId) return { incoming: [], outgoing: [] };

  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("status", "pending")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  if (error || !data) return { incoming: [], outgoing: [] };

  const partnerIds = data.map((f: { user_id: string; friend_id: string }) =>
    f.user_id === userId ? f.friend_id : f.user_id,
  );

  const { data: profiles } = await supabase.from("profiles").select("*").in("id", partnerIds);

  const profileMap = new Map((profiles ?? []).map((p: UserProfile) => [p.id, p]));

  const incoming: Friendship[] = [];
  const outgoing: Friendship[] = [];

  for (const item of data) {
    const partnerId = item.user_id === userId ? item.friend_id : item.user_id;
    const prof = profileMap.get(partnerId);
    const friendship: Friendship = {
      id: item.id,
      userId: item.user_id,
      friendId: item.friend_id,
      status: item.status,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      profile: prof,
    };

    if (item.friend_id === userId) {
      incoming.push(friendship);
    } else {
      outgoing.push(friendship);
    }
  }

  return { incoming, outgoing };
}

/**
 * Send a friend request
 */
export async function sendFriendRequest(userId: string, targetUserId: string): Promise<void> {
  if (!isSocialFeatureEnabled() || !userId || !targetUserId || userId === targetUserId) return;

  const { error } = await supabase.from("friendships").insert({
    user_id: userId,
    friend_id: targetUserId,
    status: "pending",
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("Já existe um pedido de amizade com este usuário.");
    }
    throw new Error(error.message || "Não foi possível enviar o pedido de amizade.");
  }
}

/**
 * Accept a friend request
 */
export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  if (!isSocialFeatureEnabled()) return;

  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", friendshipId);

  if (error) throw new Error(error.message || "Erro ao aceitar pedido.");
}

/**
 * Reject or cancel a friend request
 */
export async function removeFriendship(friendshipId: string): Promise<void> {
  if (!isSocialFeatureEnabled()) return;

  const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);

  if (error) throw new Error(error.message || "Erro ao remover amizade.");
}

/**
 * Block a user
 */
export async function blockUser(
  blockerId: string,
  blockedId: string,
  reason?: string,
): Promise<void> {
  if (!isSocialFeatureEnabled() || !blockerId || !blockedId) return;

  // Insert block record
  const { error: blockErr } = await supabase.from("user_blocks").insert({
    blocker_id: blockerId,
    blocked_id: blockedId,
    reason: reason ? sanitizePlainText(reason) : null,
  });

  if (blockErr && blockErr.code !== "23505") {
    throw new Error(blockErr.message || "Erro ao bloquear usuário.");
  }

  // Remove any existing friendship between them
  await supabase
    .from("friendships")
    .delete()
    .or(
      `and(user_id.eq.${blockerId},friend_id.eq.${blockedId}),and(user_id.eq.${blockedId},friend_id.eq.${blockerId})`,
    );
}

/**
 * Report a user
 */
export async function reportUser(
  reporterId: string,
  reportedId: string,
  reason: string,
  details?: string,
): Promise<void> {
  if (!isSocialFeatureEnabled() || !reporterId || !reportedId) return;

  const { error } = await supabase.from("user_reports").insert({
    reporter_id: reporterId,
    reported_id: reportedId,
    reason: sanitizePlainText(reason),
    details: details ? sanitizePlainText(details) : null,
  });

  if (error) throw new Error(error.message || "Erro ao registrar denúncia.");
}

/**
 * Create study group
 */
export async function createStudyGroup(
  userId: string,
  name: string,
  description?: string,
): Promise<StudyGroup> {
  if (!isSocialFeatureEnabled()) throw new Error("Recurso social desabilitado.");

  const cleanName = sanitizePlainText(name);
  if (!cleanName) throw new Error("O nome do grupo é obrigatório.");

  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { data, error } = await supabase
    .from("study_groups")
    .insert({
      name: cleanName,
      description: description ? sanitizePlainText(description) : null,
      created_by: userId,
      invite_code: inviteCode,
      is_private: true,
    })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message || "Erro ao criar grupo.");

  // Add creator as admin member
  await supabase.from("group_members").insert({
    group_id: data.id,
    user_id: userId,
    role: "admin",
  });

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    createdBy: data.created_by,
    isPrivate: data.is_private,
    inviteCode: data.invite_code,
    createdAt: data.created_at,
    role: "admin",
    membersCount: 1,
  };
}

/**
 * Join group using invite code
 */
export async function joinGroupByCode(userId: string, code: string): Promise<StudyGroup> {
  if (!isSocialFeatureEnabled()) throw new Error("Recurso social desabilitado.");

  const cleanCode = sanitizePlainText(code).toUpperCase();

  const { data: group, error: groupErr } = await supabase
    .from("study_groups")
    .select("*")
    .eq("invite_code", cleanCode)
    .single();

  if (groupErr || !group) {
    throw new Error("Código de convite inválido ou grupo não encontrado.");
  }

  const { error: memberErr } = await supabase.from("group_members").insert({
    group_id: group.id,
    user_id: userId,
    role: "member",
  });

  if (memberErr && memberErr.code !== "23505") {
    throw new Error(memberErr.message || "Não foi possível ingressar no grupo.");
  }

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    createdBy: group.created_by,
    isPrivate: group.is_private,
    inviteCode: group.invite_code,
    createdAt: group.created_at,
    role: "member",
  };
}

/**
 * List groups the user belongs to
 */
export async function listMyGroups(userId: string): Promise<StudyGroup[]> {
  if (!isSocialFeatureEnabled() || !userId) return [];

  const { data: memberships, error: memErr } = await supabase
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", userId);

  if (memErr || !memberships || memberships.length === 0) return [];

  const groupIds = memberships.map((m: { group_id: string }) => m.group_id);
  const roleMap = new Map(
    memberships.map((m: { group_id: string; role: "admin" | "member" }) => [m.group_id, m.role]),
  );

  const { data: groups, error: grpErr } = await supabase
    .from("study_groups")
    .select("*")
    .in("id", groupIds);

  if (grpErr || !groups) return [];

  return groups.map(
    (g: {
      id: string;
      name: string;
      description?: string | null;
      created_by: string;
      is_private: boolean;
      invite_code: string;
      created_at: string;
    }) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      createdBy: g.created_by,
      isPrivate: g.is_private,
      inviteCode: g.invite_code,
      createdAt: g.created_at,
      role: roleMap.get(g.id) ?? "member",
    }),
  );
}
