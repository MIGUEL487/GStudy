import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { backendErrorMessage } from "./backend-errors";
import { z } from "zod";

export const MAX_VOICE_PARTICIPANTS = 6;
export const CALL_INVITE_TIMEOUT_MS = 30_000;
export function isVoiceFeatureEnabled() {
  return !["false", "0"].includes(import.meta.env["VITE_FEATURE_VOICE"] ?? "true");
}
export const voiceDb = () => supabase as unknown as SupabaseClient;
export async function voiceRpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await voiceDb().rpc(name, args);
  if (error)
    throw new Error(
      backendErrorMessage(
        error,
        "Não foi possível completar esta ação na chamada. Atualize a lista e tente novamente.",
      ),
    );
  return data as unknown;
}
const person = z.object({
  user_id: z.string().uuid(),
  name: z.string(),
  avatar_url: z.string().nullable(),
});
export const snapshotSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  created_by: z.string().uuid(),
  room_id: z.string().uuid().nullable(),
  group_id: z.string().uuid().nullable(),
  can_moderate: z.boolean(),
  server_now: z.string(),
  members: z
    .array(person.extend({ muted: z.boolean(), force_muted: z.boolean(), sharing: z.boolean() }))
    .max(6),
  candidates: z.array(
    person.extend({
      online: z.boolean(),
      friend: z.boolean(),
      source_member: z.boolean(),
      next_at: z.string().nullable(),
    }),
  ),
});
export type VoiceSnapshot = z.infer<typeof snapshotSchema>;
export type VoiceMember = VoiceSnapshot["members"][number];
export const inboxSchema = z.object({
  server_now: z.string(),
  preferences: z.object({
    dnd_until: z.string().nullable().optional(),
    dnd_manual: z.boolean().optional(),
  }),
  invites: z.array(
    z.object({
      id: z.string().uuid(),
      call_id: z.string().uuid(),
      sender_id: z.string().uuid(),
      name: z.string(),
      avatar_url: z.string().nullable(),
      title: z.string(),
      expires_at: z.string(),
    }),
  ),
});
export type VoiceInbox = z.infer<typeof inboxSchema>;
export const signalSchema = z.object({
  id: z.coerce.string(),
  call_id: z.string().uuid(),
  sender_id: z.string().uuid(),
  recipient_id: z.string().uuid(),
  kind: z.enum(["offer", "answer", "ice"]),
  payload: z.record(z.unknown()),
});
export type VoiceSignal = z.infer<typeof signalSchema>;
export type DndMode = "off" | "hour" | "today" | "manual";
export function microphoneError(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "O microfone não foi autorizado. Libere a permissão nas configurações do navegador e tente novamente.";
  if (name === "NotFoundError")
    return "Não encontramos um microfone. Conecte um dispositivo e tente novamente.";
  if (name === "NotReadableError")
    return "O microfone está ocupado ou indisponível. Confira o dispositivo e tente novamente.";
  return "Não foi possível usar o microfone neste navegador. Você pode continuar ouvindo a chamada.";
}
