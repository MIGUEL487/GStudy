import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-gate";
import { getNotionImports, notionStatus } from "./notion.functions";
import type { NotionStudyPage } from "./notion-model";

export function useNotionStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notion-status", user.id],
    queryFn: () => notionStatus({ data: { userId: user.id } }),
    retry: false,
  });
}
export function useNotionImports() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notion-imports", user.id],
    retry: false,
    queryFn: async () => {
      const pages: NotionStudyPage[] = [];
      let offset = 0;
      while (true) {
        const batch = await getNotionImports({ data: { offset, userId: user.id } });
        pages.push(...batch.pages);
        if (!batch.hasMore) return pages;
        offset += 5;
      }
    },
  });
}
export function useNotionUpdates() {
  const client = useQueryClient();
  const { user } = useAuth();
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["notion-status", user.id] });
      void client.invalidateQueries({ queryKey: ["notion-imports", user.id] });
      void client.invalidateQueries({ queryKey: ["materials"] });
    };
    window.addEventListener("gstudy-notion-changed", refresh);
    return () => window.removeEventListener("gstudy-notion-changed", refresh);
  }, [client, user.id]);
}
export function safeNotionUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "notion.so" ||
        url.hostname.endsWith(".notion.so") ||
        url.hostname.endsWith(".notion.site"))
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
