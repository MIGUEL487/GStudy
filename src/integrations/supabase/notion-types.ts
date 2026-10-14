import type { Database, Json } from './types';
type Connection = { user_id: string; encrypted_token: string; workspace_name: string; updated_at: string; last_synced_at: string | null };
type Page = { user_id: string; page_id: string; material_id: string | null; title: string; source_url: string; content: string; subject: string; date_events: Json; last_edited_at: string; imported_at: string };
export type NotionDatabase = Omit<Database, 'public'> & { public: Omit<Database['public'], 'Tables' | 'Functions'> & {
  Tables: Database['public']['Tables'] & {
    notion_connections: { Row: Connection; Insert: Omit<Connection, 'updated_at' | 'last_synced_at'> & { updated_at?: string; last_synced_at?: string | null }; Update: Partial<Connection>; Relationships: [] };
    notion_pages: { Row: Page; Insert: Page; Update: Partial<Page>; Relationships: [] };
  };
  Functions: { import_notion_page: { Args: { p_page_id: string; p_title: string; p_url: string; p_content: string; p_subject: string; p_events: Json; p_last_edited: string }; Returns: string } };
} };
