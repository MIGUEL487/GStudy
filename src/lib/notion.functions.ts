import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { NotionDatabase } from "@/integrations/supabase/notion-types";
import { requireStudyAuth } from "./study-auth-middleware";
import type { NotionEvent, NotionStudyPage } from "./notion-model";

const userInput = z.string().uuid();
const checkUser = (expected: string, actual: string) => {
  if (expected !== actual)
    throw new Error("A conta mudou durante a operação. Atualize a página e tente novamente.");
};
const subjectsInput = z.array(z.string().trim().min(1).max(100)).max(200);
export const rememberNotion = createServerFn({ method: "POST" })
  .middleware([requireStudyAuth])
  .validator((input: unknown) =>
    z
      .object({
        userId: userInput,
        token: z.string().min(10).max(4096),
        refreshToken: z.string().max(4096).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    checkUser(data.userId, context.userId);
    const { saveConnection } = await import("./notion.server");
    return saveConnection(
      context.supabase as unknown as SupabaseClient<NotionDatabase>,
      context.userId,
      data.token,
      data.refreshToken,
    );
  });
export const notionStatus = createServerFn({ method: "GET" })
  .middleware([requireStudyAuth])
  .validator((input: unknown) => z.object({ userId: userInput }).parse(input))
  .handler(async ({ data: input, context }) => {
    checkUser(input.userId, context.userId);
    const db = context.supabase as unknown as SupabaseClient<NotionDatabase>;
    const { data, error } = await db
      .from("notion_connections")
      .select("workspace_name,last_synced_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) {
      const { databaseFailure } = await import("./notion.server");
      databaseFailure(error);
    }
    return {
      connected: !!data,
      workspace: data?.workspace_name || null,
      lastSynced: data?.last_synced_at || null,
    };
  });
export const listNotionPages = createServerFn({ method: "POST" })
  .middleware([requireStudyAuth])
  .validator((input: unknown) =>
    z
      .object({
        userId: userInput,
        cursor: z.string().max(500).optional(),
        sourceId: z.string().uuid().optional(),
        subjects: subjectsInput,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    checkUser(data.userId, context.userId);
    const { connectedApi, catalog } = await import("./notion.server");
    const api = await connectedApi(
      context.supabase as unknown as SupabaseClient<NotionDatabase>,
      context.userId,
    );
    return catalog(api, data.cursor, data.sourceId, data.subjects);
  });
export const importNotionPage = createServerFn({ method: "POST" })
  .middleware([requireStudyAuth])
  .validator((input: unknown) =>
    z
      .object({
        userId: userInput,
        id: z.string().uuid(),
        subjects: subjectsInput,
        subject: z.string().trim().max(100).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    checkUser(data.userId, context.userId);
    const { importPage } = await import("./notion.server");
    return importPage(
      context.supabase as unknown as SupabaseClient<NotionDatabase>,
      context.userId,
      data.id,
      data.subjects,
      data.subject,
    );
  });
export const getNotionImports = createServerFn({ method: "GET" })
  .middleware([requireStudyAuth])
  .validator((input: unknown) =>
    z
      .object({ userId: userInput, offset: z.number().int().min(0).max(100000).default(0) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    checkUser(data.userId, context.userId);
    const db = context.supabase as unknown as SupabaseClient<NotionDatabase>;
    const { data: rows, error } = await db
      .from("notion_pages")
      .select("*")
      .eq("user_id", context.userId)
      .order("imported_at", { ascending: false })
      .range(data.offset, data.offset + 4);
    if (error) {
      const { databaseFailure } = await import("./notion.server");
      databaseFailure(error);
    }
    const pages: NotionStudyPage[] = (rows ?? []).map((row) => ({
      id: row.page_id,
      title: row.title,
      url: row.source_url,
      text: row.content,
      subject: row.subject,
      events: row.date_events as unknown as NotionEvent[],
      lastEdited: row.last_edited_at,
      importedAt: row.imported_at,
    }));
    return { pages, hasMore: pages.length === 5 };
  });
export const disconnectNotion = createServerFn({ method: "POST" })
  .middleware([requireStudyAuth])
  .validator((input: unknown) => z.object({ userId: userInput }).parse(input))
  .handler(async ({ data: input, context }) => {
    checkUser(input.userId, context.userId);
    const db = context.supabase as unknown as SupabaseClient<NotionDatabase>;
    const { error } = await db.from("notion_connections").delete().eq("user_id", context.userId);
    if (error) {
      const { databaseFailure } = await import("./notion.server");
      databaseFailure(error);
    }
    return { disconnected: true };
  });
