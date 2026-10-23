import { supabase } from "@/integrations/supabase/client";

export type NotificationType =
  "friend_request" | "friend_accepted" | "room_invite" | "year_rollover" | "system";

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

    if (error || !data) return [];

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
  } catch {
    return [];
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  try {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  } catch {
    // silent fallback
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  try {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
  } catch {
    // silent fallback
  }
}

export function subscribeToNotifications(
  userId: string,
  onNotification: (n: AppNotification) => void,
): () => void {
  if (!userId) return () => {};

  const channel = supabase
    .channel(`notifications:${userId}`)
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
