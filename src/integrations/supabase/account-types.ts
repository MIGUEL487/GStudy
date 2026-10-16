import type { Database, Json } from "./types";
export type AccountDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      account_documents: {
        Row: {
          user_id: string;
          namespace: string;
          revision: number;
          document: Json;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: {
      sync_account_document: {
        Args: { p_namespace: string; p_revision: number; p_document: Json };
        Returns: Json;
      };
      get_review_board: {
        Args: { p_tab: string; p_sort: string; p_offset: number };
        Returns: Json;
      };
      create_app_review: {
        Args: { p_category: string; p_rating: number; p_body: string; p_anonymous: boolean };
        Returns: string;
      };
      vote_app_review: { Args: { p_review_id: string; p_value: number }; Returns: undefined };
      reply_app_review: { Args: { p_review_id: string; p_reply: string }; Returns: undefined };
      delete_app_review: { Args: { p_review_id: string }; Returns: undefined };
    };
  };
};
