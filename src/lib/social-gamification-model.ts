import { supabase } from "@/integrations/supabase/client";
import { isSocialFeatureEnabled } from "./social-model";

export type RankingVisibility = "public" | "anonymous" | "hidden";

export type LeaderboardEntry = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  weeklyFocusMinutes: number;
  rankPosition: number;
  isCurrentUser: boolean;
};

export type SocialAchievement = {
  id: string;
  userId: string;
  achievementKey: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt: string;
};

/**
 * Fetch weekly focus leaderboard for friends or study group
 */
export async function getSocialLeaderboard(
  scope: "friends" | "group" = "friends",
  groupId?: string,
): Promise<LeaderboardEntry[]> {
  if (!isSocialFeatureEnabled()) return [];

  const { data, error } = await supabase.rpc("get_social_leaderboard", {
    p_scope: scope,
    p_group_id: groupId ?? null,
  });

  if (error || !data) return [];

  return (
    data as Array<{
      user_id: string;
      display_name: string;
      username: string;
      avatar_url: string | null;
      weekly_focus_minutes: number;
      rank_position: number;
      is_current_user: boolean;
    }>
  ).map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    username: row.username,
    avatarUrl: row.avatar_url,
    weeklyFocusMinutes: Number(row.weekly_focus_minutes || 0),
    rankPosition: Number(row.rank_position || 1),
    isCurrentUser: Boolean(row.is_current_user),
  }));
}

/**
 * List achievements unlocked by a user
 */
export async function listUserAchievements(userId: string): Promise<SocialAchievement[]> {
  if (!isSocialFeatureEnabled() || !userId) return [];

  const { data, error } = await supabase
    .from("social_achievements")
    .select("*")
    .eq("user_id", userId)
    .order("unlocked_at", { ascending: false });

  if (error || !data) return [];

  return (
    data as Array<{
      id: string;
      user_id: string;
      achievement_key: string;
      title: string;
      description: string;
      icon: string;
      unlocked_at: string;
    }>
  ).map((a) => ({
    id: a.id,
    userId: a.user_id,
    achievementKey: a.achievement_key,
    title: a.title,
    description: a.description,
    icon: a.icon,
    unlockedAt: a.unlocked_at,
  }));
}

/**
 * Update the user's leaderboard visibility
 */
export async function updateRankingVisibility(
  userId: string,
  visibility: RankingVisibility,
): Promise<void> {
  if (!isSocialFeatureEnabled() || !userId) return;

  const { error } = await supabase
    .from("profiles")
    .update({ ranking_visibility: visibility })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message || "Erro ao atualizar visibilidade no ranking.");
  }
}

/**
 * Record a completed focus session (in a room or solo)
 */
export async function recordFocusSession(roomId: string | null, minutes: number): Promise<void> {
  if (!isSocialFeatureEnabled()) return;

  const { error } = await supabase.rpc("record_room_focus_session", {
    p_room_id: roomId,
    p_minutes: minutes,
  });

  if (error) {
    // Fallback direct insert if RPC not yet deployed
    await supabase.from("social_focus_logs").insert({
      room_id: roomId,
      minutes,
    });
  }
}

/**
 * Trigger celebration particles on study goal completion
 * Respects prefers-reduced-motion
 */
export function triggerGoalCelebration(): void {
  if (typeof window === "undefined") return;

  // Check prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  // Create lightweight ephemeral celebration overlay
  const container = document.createElement("div");
  container.className = "celebration-confetti-container";
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);

  const colors = ["#2f4a3a", "#7fd1ae", "#d4af37", "#a0522d", "#5b8266"];
  const particleCount = 28;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement("div");
    particle.className = "celebration-particle";
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const animDelay = Math.random() * 0.4;
    const size = 6 + Math.random() * 6;

    particle.style.cssText = `
      position: fixed;
      top: -10px;
      left: ${left}vw;
      width: ${size}px;
      height: ${size * 1.4}px;
      background-color: ${color};
      border-radius: 2px;
      pointer-events: none;
      z-index: 9999;
      opacity: 0.9;
      transform: rotate(${Math.random() * 360}deg);
      animation: particle-drop 1.8s ease-in ${animDelay}s forwards;
    `;
    container.appendChild(particle);
  }

  setTimeout(() => {
    container.remove();
  }, 2500);
}
