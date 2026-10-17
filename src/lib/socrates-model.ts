import { z } from "zod";
export const socratesDailyTokens = 50_000;
export const socratesOutputTokens = 4096;
export const socratesStorageKey = (userId: string) => `gstudy.socrates.v1:${userId}`;
export const socratesMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(4000),
  question: z.string().trim().max(600).optional(),
  createdAt: z.string().datetime(),
});
export const socratesConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120),
  subject: z.string().max(100),
  createdAt: z.string().datetime(),
  // Sync can combine independently completed turns at the UI's 200-message limit.
  messages: z.array(socratesMessageSchema).max(1000),
});
export const socratesDocumentSchema = z.object({
  version: z.literal(1),
  conversations: z.array(socratesConversationSchema).max(200),
});
export type SocratesDocument = z.infer<typeof socratesDocumentSchema>;
export type SocratesConversation = z.infer<typeof socratesConversationSchema>;
export type SocratesMessage = z.infer<typeof socratesMessageSchema>;
export const socratesQuotaSchema = z.object({
  limit: z.literal(socratesDailyTokens),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  resetsAt: z.string().datetime({ offset: true }),
});
export type SocratesQuota = z.infer<typeof socratesQuotaSchema>;
export function readSocratesDocument(raw?: string | null): SocratesDocument {
  return raw ? socratesDocumentSchema.parse(JSON.parse(raw)) : { version: 1, conversations: [] };
}
export function recentSocratesHistory(messages: SocratesMessage[]) {
  const history: { role: "user" | "assistant"; text: string }[] = [];
  let bytes = 0;
  // Keep complete turns; bound context cost without discarding the visible history.
  for (let i = messages.length - 2; i >= 0 && history.length < 8; i -= 2) {
    const user = messages[i]!,
      assistant = messages[i + 1]!;
    if (user.role !== "user" || assistant.role !== "assistant") break;
    const answer = [assistant.text, assistant.question].filter(Boolean).join("\n\n");
    const cost = new TextEncoder().encode(user.text + answer).length;
    if (bytes + cost > 7000) break;
    bytes += cost;
    history.unshift({ role: "user", text: user.text }, { role: "assistant", text: answer });
  }
  return history;
}
