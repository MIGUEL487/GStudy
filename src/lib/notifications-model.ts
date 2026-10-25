import { supabase } from "@/integrations/supabase/client";
import { backendErrorMessage } from "./backend-errors";

export type NotificationType =
  | "friend_request"
  | "friend_accepted"
  | "room_invite"
  | "year_rollover"
  | "system"
  | "direct_message"
  | "missed_call"
  | "game_challenge";

export type AppNotification = {
  id: string;
  userId: string;
  senderId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
};

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error)
      throw new Error(backendErrorMessage(error, "Não foi possível carregar suas notificações."));
    if (!data) return [];

    return data.map((n: Record<string, unknown>) => ({
      id: String(n.id),
      userId: String(n.user_id),
      senderId: n.sender_id ? String(n.sender_id) : null,
      type: n.type as NotificationType,
      title: String(n.title),
      body: String(n.body),
      data: (n.data as Record<string, unknown>) || {},
      read: Boolean(n.read),
      createdAt: String(n.created_at),
    }));
  } catch (cause) {
    throw cause instanceof Error
      ? cause
      : new Error("Não foi possível carregar suas notificações.");
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  try {
    const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
    if (error)
      throw new Error(
        backendErrorMessage(error, "Não foi possível marcar esta notificação como lida."),
      );
  } catch (cause) {
    throw cause instanceof Error
      ? cause
      : new Error("Não foi possível marcar esta notificação como lida.");
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    if (error)
      throw new Error(
        backendErrorMessage(error, "Não foi possível marcar as notificações como lidas."),
      );
  } catch (cause) {
    throw cause instanceof Error
      ? cause
      : new Error("Não foi possível marcar as notificações como lidas.");
  }
}

export function subscribeToNotifications(
  userId: string,
  onNotification: (n: AppNotification) => void,
): () => void {
  if (!userId) return () => {};

  const channel = supabase
    .channel(`notifications:${userId}`, { config: { private: true } })
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (row) {
          onNotification({
            id: String(row.id),
            userId: String(row.user_id),
            senderId: row.sender_id ? String(row.sender_id) : null,
            type: row.type as NotificationType,
            title: String(row.title),
            body: String(row.body),
            data: (row.data as Record<string, unknown>) || {},
            read: Boolean(row.read),
            createdAt: String(row.created_at),
          });
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
