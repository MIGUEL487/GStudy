import { supabase } from "@/integrations/supabase/client";
import { sanitizePlainText } from "./social-model";

export type DirectMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  readAt?: string | null;
  createdAt: string;
};

export async function fetchDirectMessages(
  currentUserId: string,
  friendId: string,
): Promise<DirectMessage[]> {
  if (!currentUserId || !friendId) return [];

  try {
    const { data, error } = await supabase
      .from("direct_messages")
      .select("*")
      .or(
        `and(sender_id.eq.${currentUserId},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${currentUserId})`,
      )
      .order("created_at", { ascending: true })
      .limit(100);

    if (error || !data) return [];

    return data.map((m: Record<string, unknown>) => ({
      id: String(m.id),
      senderId: String(m.sender_id),
      recipientId: String(m.recipient_id),
      content: String(m.content),
      readAt: m.read_at ? String(m.read_at) : null,
      createdAt: String(m.created_at),
    }));
  } catch {
    return [];
  }
}

export async function sendDirectMessage(
  currentUserId: string,
  recipientId: string,
  rawContent: string,
): Promise<DirectMessage | null> {
  const clean = sanitizePlainText(rawContent).trim();
  if (!clean || clean.length > 1000) return null;

  try {
    const { data, error } = await supabase
      .from("direct_messages")
      .insert({
        sender_id: currentUserId,
        recipient_id: recipientId,
        content: clean,
      })
      .select()
      .single();

    if (error || !data) throw error;

    return {
      id: String(data.id),
      senderId: String(data.sender_id),
      recipientId: String(data.recipient_id),
      content: String(data.content),
      readAt: data.read_at ? String(data.read_at) : null,
      createdAt: String(data.created_at),
    };
  } catch {
    return null;
  }
}

export async function markDirectMessagesAsRead(
  currentUserId: string,
  friendId: string,
): Promise<void> {
  try {
    await supabase
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", currentUserId)
      .eq("sender_id", friendId)
      .is("read_at", null);
  } catch {
    // silent fallback
  }
}

export function subscribeToDirectMessages(
  currentUserId: string,
  friendId: string,
  onMessage: (msg: DirectMessage) => void,
): () => void {
  if (!currentUserId || !friendId) return () => {};

  const pairKey = [currentUserId, friendId].sort().join(":");
  const channel = supabase
    .channel(`dm:${pairKey}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "direct_messages",
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (!row) return;

        const sId = String(row.sender_id);
        const rId = String(row.recipient_id);

        if (
          (sId === currentUserId && rId === friendId) ||
          (sId === friendId && rId === currentUserId)
        ) {
          onMessage({
            id: String(row.id),
            senderId: sId,
            recipientId: rId,
            content: String(row.content),
            readAt: row.read_at ? String(row.read_at) : null,
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
