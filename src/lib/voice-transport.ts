import { supabase } from "@/integrations/supabase/client";
import { signalSchema, voiceDb, voiceRpc, type VoiceSignal } from "./voice-rpc";

export function createVoiceTransport(
  callId: string,
  userId: string,
  onSignal: (signal: VoiceSignal) => void,
  onError: (message: string) => void,
) {
  let closed = false,
    polling = false;
  const seen = new Set<string>();
  const receive = (raw: unknown) => {
    const result = signalSchema.safeParse(raw);
    if (closed || !result.success) return;
    const signal = result.data;
    if (signal.call_id !== callId || signal.recipient_id !== userId || seen.has(signal.id)) return;
    seen.add(signal.id);
    if (seen.size > 2000) seen.delete(seen.values().next().value!);
    onSignal(signal);
  };
  // Only database-authored rows are accepted; broadcast sender names are never trusted.
  const channel = supabase
    .channel(`voice:${callId}`, { config: { private: true } })
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "call_signals",
        filter: `recipient_id=eq.${userId}`,
      },
      (payload) => receive(payload.new),
    )
    .subscribe();
  const poll = async () => {
    if (closed || polling) return;
    polling = true;
    try {
      const { data, error } = await voiceDb()
        .from("call_signals")
        .select("*")
        .eq("call_id", callId)
        .eq("recipient_id", userId)
        .order("id", { ascending: false })
        .limit(1000);
      if (error) throw error;
      for (const signal of (data ?? []).reverse()) receive(signal);
    } catch {
      if (!closed)
        onError(
          "A conexão da chamada foi interrompida. Confira a internet; estamos tentando reconectar.",
        );
    } finally {
      polling = false;
    }
  };
  void poll();
  // Recovery for missed events and installations where Realtime is not yet published.
  const timer = setInterval(() => void poll(), 3000);
  return {
    send: async (recipient: string, kind: VoiceSignal["kind"], payload: object) => {
      if (!closed)
        await voiceRpc("send_voice_signal", {
          p_call: callId,
          p_recipient: recipient,
          p_kind: kind,
          p_payload: payload,
        });
    },
    close: () => {
      closed = true;
      clearInterval(timer);
      void supabase.removeChannel(channel);
    },
  };
}
