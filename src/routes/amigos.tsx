import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SocialFriendsPanel } from "@/components/social-friends-panel";
import { isSocialFeatureEnabled } from "@/lib/social-model";

export const Route = createFileRoute("/amigos")({
  head: () => ({
    meta: [
      { title: "GStudy · Amigos e Grupos" },
      { name: "description", content: "Conecte-se com amigos e crie grupos de estudos no GStudy." },
    ],
  }),
  component: AmigosRoute,
});

function AmigosRoute() {
  const navigate = useNavigate();
  const enabled = isSocialFeatureEnabled();

  useEffect(() => {
    if (!enabled) {
      void navigate({ to: "/" });
    }
  }, [enabled, navigate]);

  if (!enabled) {
    return null;
  }

  return <SocialFriendsPanel />;
}
