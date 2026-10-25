import { createFileRoute, redirect } from "@tanstack/react-router";
import type { SessionTab } from "@/components/sessions-view";
export const Route = createFileRoute("/salas")({
  validateSearch: (search: Record<string, unknown>): { tab?: SessionTab } =>
    ["rooms", "groups", "games"].includes(String(search["tab"]))
      ? { tab: search["tab"] as SessionTab }
      : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/sessoes", search: { tab: search.tab ?? "rooms" }, replace: true });
  },
});
