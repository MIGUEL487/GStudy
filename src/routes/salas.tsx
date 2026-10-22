import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { StudyRoomsView } from "@/components/study-rooms-view";
import { isSocialFeatureEnabled } from "@/lib/social-model";

export const Route = createFileRoute("/salas")({
  head: () => ({
    meta: [
      { title: "GStudy · Salas de Estudo ao Vivo" },
      { name: "description", content: "Salas de estudo ao vivo com Pomodoro sincronizado." },
    ],
  }),
  component: SalasRoute,
});

function SalasRoute() {
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

  return <StudyRoomsView />;
}
