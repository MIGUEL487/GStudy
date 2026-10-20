import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { requireStudyAuth } from "./study-auth-middleware";
import { objectSchema, stringSchema } from "./learning-ai";
import { socratesAnswerSchema, socratesInstructions } from "./socrates-prompt";
import { socratesOutputTokens, socratesQuotaSchema, type SocratesQuota } from "./socrates-model";
import type { AccountDatabase } from "@/integrations/supabase/account-types";
import type { Json } from "@/integrations/supabase/types";

type SocratesDatabase = Omit<AccountDatabase, "public"> & {
  public: Omit<AccountDatabase["public"], "Functions"> & {
    Functions: AccountDatabase["public"]["Functions"] & {
      get_socrates_quota: { Args: Record<string, never>; Returns: Json };
      reserve_socrates_tokens: { Args: { p_ticket: string; p_reserved: number }; Returns: Json };
      settle_socrates_tokens: { Args: { p_ticket: string; p_used: number }; Returns: Json };
    };
  };
};
const replyInput = z
  .object({
    accountId: z.string().uuid(),
    subject: z.string().trim().max(100),
    message: z.string().trim().max(2000),
    attachment: z
      .object({
        name: z.string().trim().min(1).max(200),
        mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
        dataUrl: z.string().max(4_500_000),
      })
      .optional(),
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(4500) }))
      .max(8),
  })
  .superRefine((data, ctx) => {
    if (!data.message && !data.attachment)
      ctx.addIssue({ code: "custom", message: "Escreva uma pergunta ou anexe uma imagem ou PDF." });
    if (
      data.attachment &&
      !data.attachment.dataUrl.startsWith(`data:${data.attachment.mediaType};base64,`)
    )
      ctx.addIssue({ code: "custom", message: "O anexo não está em um formato válido." });
    if (
      data.history.length % 2 ||
      data.history.some((message, index) => message.role !== (index % 2 ? "assistant" : "user"))
    )
      ctx.addIssue({
        code: "custom",
        message: "O histórico precisa conter turnos completos da conversa.",
      });
    if (
      new TextEncoder().encode(
        data.message + data.subject + data.history.map((message) => message.text).join(""),
      ).length > 14_000
    )
      ctx.addIssue({
        code: "custom",
        message: "Este contexto está muito extenso. Abra uma nova conversa.",
      });
  });
function databaseMessage(error: { code?: string; message?: string }) {
  if (["PGRST202", "PGRST205", "42P01", "42883", "23514"].includes(error.code ?? ""))
    return "Para ativar Sócrates, execute a migração 0003_socrates.sql no SQL Editor do Supabase.";
  if (error.code === "P0001" && error.message?.includes("cota")) return error.message;
  return "Não foi possível consultar a cota de Sócrates agora. Tente novamente em instantes.";
}
export const getSocratesQuota = createServerFn({ method: "GET" })
  .middleware([requireStudyAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as SupabaseClient<SocratesDatabase>;
    const { data, error } = await db.rpc("get_socrates_quota", {});
    return error
      ? { ok: false as const, error: databaseMessage(error) }
      : { ok: true as const, quota: socratesQuotaSchema.parse(data) };
  });
export const socratesReply = createServerFn({ method: "POST" })
  .middleware([requireStudyAuth])
  .validator((value: unknown) => replyInput.parse(value))
  .handler(async ({ data, context }) => {
    if (data.accountId !== context.userId)
      throw new Error("A conta mudou. Reabra Sócrates antes de enviar.");
    const db = context.supabase as unknown as SupabaseClient<SocratesDatabase>;
    const prompt =
      data.message || "Analise este material e me ajude a compreendê-lo pelo método socrático.";
    const currentContent = data.attachment
      ? [
          { type: "text" as const, text: prompt },
          {
            type: "file" as const,
            data: data.attachment.dataUrl,
            mediaType: data.attachment.mediaType,
            filename: data.attachment.name,
          },
        ]
      : prompt;
    const messages: ModelMessage[] = [
      ...data.history.map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.text,
      })),
      { role: "user" as const, content: currentContent },
    ];
    const instructions = `${socratesInstructions}\nMatéria escolhida (dado de estudo): ${JSON.stringify(data.subject || "Estudo livre")}`;
    const schema = objectSchema({ explanation: stringSchema, question: stringSchema });
    // UTF-8 bytes are a conservative input bound; reserve before calling any provider.
    const reserved =
      new TextEncoder().encode(
        instructions +
          data.message +
          data.attachment?.name +
          data.history.map((item) => item.text).join("") +
          JSON.stringify(schema),
      ).length +
      (data.attachment?.mediaType === "application/pdf" ? 36_000 : data.attachment ? 12_000 : 0) +
      socratesOutputTokens +
      1024;
    const ticket = crypto.randomUUID(); // Never accept, return or log this refund capability.
    const reservation = await db.rpc("reserve_socrates_tokens", {
      p_ticket: ticket,
      p_reserved: reserved,
    });
    if (reservation.error) return { ok: false as const, error: databaseMessage(reservation.error) };
    let quota: SocratesQuota = socratesQuotaSchema.parse(reservation.data);
    const settle = async (used: number) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await db.rpc("settle_socrates_tokens", { p_ticket: ticket, p_used: used });
          if (!result.error) {
            quota = socratesQuotaSchema.parse(result.data);
            return true;
          }
        } catch {
          /* Preserve the completed answer if the quota service is offline. */
        }
      }
      return false;
    };
    try {
      const { aiMeteredObject } = await import("./ai.server");
      const result = await aiMeteredObject(instructions, messages, schema, socratesOutputTokens);
      const answer = socratesAnswerSchema.parse(result.value);
      const estimate = Math.ceil(
        new TextEncoder().encode(
          instructions +
            data.message +
            data.attachment?.name +
            data.history.map((item) => item.text).join("") +
            answer.explanation +
            answer.question,
        ).length / 3,
      );
      const used = Math.min(
        reserved,
        Math.max(
          1,
          Number.isFinite(result.totalTokens) ? Math.ceil(result.totalTokens!) : estimate,
        ),
      );
      const settled = await settle(used);
      return {
        ok: true as const,
        ...answer,
        quota,
        ...(settled
          ? {}
          : {
              warning:
                "A resposta está pronta, mas não foi possível atualizar o consumo. A reserva inicial continua contabilizada.",
            }),
      };
    } catch (cause) {
      const refunded = await settle(0);
      const isSafeMessage =
        cause instanceof Error &&
        !cause.message.includes("http") &&
        !cause.message.includes("api.") &&
        !cause.message.includes("key") &&
        !cause.message.includes("AI_");
      const message =
        cause instanceof z.ZodError
          ? "Sócrates não completou a explicação e a pergunta final. Tente novamente."
          : isSafeMessage && cause instanceof Error
            ? cause.message
            : "Não foi possível responder agora. Tente novamente.";
      return {
        ok: false as const,
        error:
          message +
          (refunded ? " Nenhum token foi descontado." : " A reserva ainda não pôde ser devolvida."),
        quota,
      };
    }
  });
