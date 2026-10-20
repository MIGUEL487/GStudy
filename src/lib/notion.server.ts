import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotionDatabase } from "@/integrations/supabase/notion-types";
import type { Json } from "@/integrations/supabase/types";
import {
  eventsOf,
  isStudyRelated,
  notionTitle,
  propertyText,
  richText,
  subjectOf,
  type NotionPage,
  type NotionStudyPage,
  type RichText,
} from "./notion-model";
import { openNotionToken, sealNotionToken } from "./notion-crypto.server";

type DB = SupabaseClient<NotionDatabase>;
const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";
export function databaseFailure(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202")
    throw new Error(
      "A integração Notion precisa da migração 0001_notion.sql no SQL Editor do Supabase.",
    );
  throw new Error("Não foi possível salvar ou consultar o Notion na sua conta. Tente novamente.");
}

export class NotionApi {
  private nextRequestAt = 0;
  constructor(
    private token: string,
    private refresh?: () => Promise<string>,
  ) {}
  async request<T>(path: string, body?: unknown, retries = 0): Promise<T> {
    // Only relative API paths assembled by this module are allowed.
    if (!path.startsWith("/") || path.includes("://") || path.includes(".."))
      throw new Error("Caminho Notion inválido.");
    const delay = this.nextRequestAt - Date.now();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    this.nextRequestAt = Date.now() + 360;
    let response: Response;
    try {
      response = await fetch(API + path, {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Notion-Version": VERSION,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new Error("Não foi possível conectar ao Notion. Tente novamente em instantes.");
    }
    if (response.status === 401 && this.refresh && retries === 0) {
      this.token = await this.refresh();
      return this.request<T>(path, body, 1);
    }
    if (response.status === 429 && retries < 2) {
      const seconds = Math.min(10, Math.max(1, Number(response.headers.get("retry-after")) || 1));
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      return this.request<T>(path, body, retries + 1);
    }
    if (response.status === 401)
      throw new Error(
        "A autorização do Notion expirou. Conecte o Notion novamente nas configurações.",
      );
    if (response.status === 403 || response.status === 404)
      throw new Error(
        "O Notion não permitiu ler esta página. Compartilhe a página e suas tabelas com a conexão GStudy no Notion.",
      );
    if (!response.ok)
      throw new Error(
        `O Notion recusou a operação (${response.status}). Confira as permissões de leitura ou tente novamente.`,
      );
    return response.json() as Promise<T>;
  }
}

export async function saveConnection(
  db: DB,
  userId: string,
  accessToken: string,
  refreshToken?: string,
) {
  const encrypted = sealNotionToken(
    { accessToken, ...(refreshToken ? { refreshToken } : {}) },
    userId,
  );
  const identity = await new NotionApi(accessToken).request<{
    type: string;
    bot?: { workspace_name?: string };
  }>("/users/me");
  if (identity.type !== "bot")
    throw new Error("O token recebido não é de uma conexão Notion. Autorize o Notion novamente.");
  const workspace = identity.bot?.workspace_name || "Seu espaço no Notion";
  const { error } = await db.from("notion_connections").upsert({
    user_id: userId,
    encrypted_token: encrypted,
    workspace_name: workspace,
    updated_at: new Date().toISOString(),
  });
  if (error) databaseFailure(error);
  return { connected: true, workspace };
}

export async function connectedApi(db: DB, userId: string) {
  const { data, error } = await db
    .from("notion_connections")
    .select("encrypted_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) databaseFailure(error);
  if (!data)
    throw new Error("Conecte sua conta do Notion nas configurações para importar seus estudos.");
  const token = openNotionToken(data.encrypted_token, userId);
  let refreshed: Promise<string> | undefined;
  const refresh = async () => {
    if (
      !token.refreshToken ||
      !process.env["NOTION_CLIENT_ID"] ||
      !process.env["NOTION_CLIENT_SECRET"]
    )
      throw new Error(
        "A autorização do Notion expirou. Conecte novamente ou configure as credenciais de renovação no servidor.",
      );
    refreshed ??= (async () => {
      const response = await fetch(API + "/oauth/token", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              `${process.env["NOTION_CLIENT_ID"]}:${process.env["NOTION_CLIENT_SECRET"]}`,
            ).toString("base64"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ grant_type: "refresh_token", refresh_token: token.refreshToken }),
      });
      if (!response.ok)
        throw new Error(
          "A autorização do Notion expirou. Conecte o Notion novamente nas configurações.",
        );
      const fresh = (await response.json()) as { access_token?: string; refresh_token?: string };
      if (!fresh.access_token)
        throw new Error("O Notion não retornou uma nova autorização. Conecte novamente.");
      const encrypted = sealNotionToken(
        {
          accessToken: fresh.access_token,
          refreshToken: fresh.refresh_token || token.refreshToken!,
        },
        userId,
      );
      const saved = await db
        .from("notion_connections")
        .update({ encrypted_token: encrypted, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (saved.error) databaseFailure(saved.error);
      return fresh.access_token;
    })();
    return refreshed;
  };
  return new NotionApi(token.accessToken, refresh);
}

type List = { results: NotionPage[]; has_more: boolean; next_cursor: string | null };
export async function catalog(
  api: NotionApi,
  cursor: string | undefined,
  sourceId: string | undefined,
  subjects: string[],
) {
  const response = await api.request<List>(
    sourceId ? `/data_sources/${sourceId}/query` : "/search",
    {
      page_size: 50,
      ...(cursor ? { start_cursor: cursor } : {}),
      ...(!sourceId ? { sort: { direction: "descending", timestamp: "last_edited_time" } } : {}),
    },
  );
  return {
    items: response.results
      .filter(
        (page) => !page.archived && !page.in_trash && ["page", "data_source"].includes(page.object),
      )
      .map((page) => ({
        id: page.id,
        title: notionTitle(page),
        kind: page.object === "data_source" ? ("data_source" as const) : ("page" as const),
        url: page.url || `https://www.notion.so/${page.id.replace(/-/g, "")}`,
        lastEdited: page.last_edited_time || "",
        suggested: isStudyRelated(notionTitle(page), subjects),
      })),
    hasMore: response.has_more,
    cursor: response.next_cursor,
  };
}

type Block = {
  id: string;
  type: string;
  has_children?: boolean;
  archived?: boolean;
  in_trash?: boolean;
  [key: string]: unknown;
};
type BlockPayload = {
  rich_text?: RichText[];
  caption?: RichText[];
  title?: string;
  cells?: RichText[][];
  checked?: boolean;
  expression?: string;
  url?: string;
  synced_from?: { block_id?: string } | null;
};
export async function readPageText(api: NotionApi, page: NotionPage) {
  let blocks = 0,
    requests = 0;
  const lines = [`# ${notionTitle(page)}`];
  const warnings = new Set<string>();
  for (const [name, value] of Object.entries(page.properties ?? {})) {
    if (value.type === "title") continue;
    const text = propertyText(value);
    if (text) lines.push(`${name}: ${text}`);
    if (value.type === "relation")
      warnings.add(
        "Relações entre tabelas precisam ser compartilhadas e importadas separadamente.",
      );
  }
  const visited = new Set<string>();
  const walk = async (id: string, depth: number): Promise<void> => {
    if (visited.has(id)) return;
    visited.add(id);
    if (depth > 12)
      throw new Error(
        "Esta página é muito profunda. Importe suas subpáginas separadamente para guardar o conteúdo completo.",
      );
    let cursor: string | null = null;
    do {
      if (++requests > 40)
        throw new Error(
          "Esta página é muito extensa. Importe suas subpáginas separadamente; nenhum conteúdo parcial foi salvo.",
        );
      const response: { results: Block[]; has_more: boolean; next_cursor: string | null } =
        await api.request(
          `/blocks/${id}/children?page_size=100${cursor ? "&start_cursor=" + encodeURIComponent(cursor) : ""}`,
        );
      for (const block of response.results) {
        if (block.archived || block.in_trash) continue;
        if (++blocks > 1500)
          throw new Error(
            "Esta página tem mais de 1500 blocos. Importe suas subpáginas separadamente; nenhum conteúdo parcial foi salvo.",
          );
        const payload = (block[block.type] || {}) as BlockPayload;
        const text = richText(payload.rich_text);
        if (block.type === "unsupported")
          warnings.add(
            "O Notion informou um bloco não suportado pela API. Confira o original pelo link da página.",
          );
        if (block.type === "child_page" || block.type === "child_database") {
          lines.push(
            `[${payload.title || "Subpágina"}] https://www.notion.so/${block.id.replace(/-/g, "")}`,
          );
          warnings.add(
            "Subpáginas e tabelas são itens independentes: abra-as na lista e importe também.",
          );
          continue;
        }
        if (text)
          lines.push(`${block.type === "to_do" ? (payload.checked ? "[x] " : "[ ] ") : ""}${text}`);
        if (payload.cells) lines.push(payload.cells.map((cell) => richText(cell)).join(" | "));
        if (payload.expression) lines.push(payload.expression);
        if (payload.url) lines.push(payload.url);
        if (["image", "pdf", "file", "video", "audio", "embed", "bookmark"].includes(block.type)) {
          const caption = richText(payload.caption);
          if (caption) lines.push(caption);
          warnings.add(
            "Anexos e imagens não são baixados nem interpretados nesta importação; o texto e as legendas disponíveis são preservados.",
          );
        }
        if (block.type === "synced_block" && payload.synced_from?.block_id)
          await walk(payload.synced_from.block_id, depth + 1);
        else if (block.has_children) await walk(block.id, depth + 1);
      }
      cursor = response.has_more ? response.next_cursor : null;
      if (response.has_more && !cursor)
        throw new Error("O Notion retornou uma paginação incompleta. Tente importar novamente.");
    } while (cursor);
  };
  await walk(page.id, 0);
  const text = lines.join("\n\n");
  if (text.length > 200000)
    throw new Error(
      "A página ultrapassa 200 mil caracteres. Divida-a em subpáginas para guardar tudo. Nenhuma versão parcial foi salva.",
    );
  return { text, warnings: [...warnings] };
}

export async function condenseNotionContent(text: string, userId: string): Promise<string> {
  if (text.length <= 30000) return text;
  try {
    const { aiText } = await import("./ai.server");
    const summary = await aiText(
      "Resuma os pontos centrais, fatos, conceitos e fórmulas desta página de estudo do Notion em português brasileiro (máximo 15000 caracteres) para ser usado como base de estudos.",
      [{ role: "user", content: text.slice(0, 60000) }],
    );
    if (typeof summary === "string" && summary.trim().length > 50) {
      return summary.trim();
    }
  } catch {
    // Fallback: se IA não responder, corte limpo mantendo limite seguro
  }
  return text.slice(0, 30000);
}

export async function importPage(
  db: DB,
  userId: string,
  id: string,
  subjects: string[],
  subject: string,
) {
  const api = await connectedApi(db, userId);
  const page = await api.request<NotionPage>(`/pages/${id}`);
  if (page.archived || page.in_trash)
    throw new Error("Essa página foi arquivada ou está na lixeira do Notion.");
  const { text, warnings } = await readPageText(api, page);
  let inherited = subject;
  if (!inherited && page.parent?.page_id) {
    const parent = await api.request<NotionPage>(`/pages/${page.parent.page_id}`).catch(() => null);
    if (parent) inherited = notionTitle(parent);
  }
  const title = notionTitle(page).slice(0, 120);
  const url = page.url || `https://www.notion.so/${page.id.replace(/-/g, "")}`;
  const chosenSubject = subject.trim() || subjectOf(page, subjects, inherited);
  const events = eventsOf(page, text);
  const lastEdited = page.last_edited_time || new Date().toISOString();
  const memoryContent = await condenseNotionContent(text, userId);
  const { error } = await db.rpc("import_notion_page", {
    p_page_id: page.id,
    p_title: title,
    p_url: url,
    p_content: memoryContent,
    p_subject: chosenSubject,
    p_events: events as unknown as Json,
    p_last_edited: lastEdited,
  });
  if (error) databaseFailure(error);
  const importedAt = new Date().toISOString();
  return {
    page: {
      id: page.id,
      title,
      url,
      text: memoryContent,
      subject: chosenSubject,
      events,
      lastEdited,
      importedAt,
    } satisfies NotionStudyPage,
    warnings,
  };
}
