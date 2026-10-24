import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
const CallScreen = lazy(() => import("@/components/voice/call-screen"));
export const Route = createFileRoute("/chamada")({
  head: () => ({ meta: [{ title: "GStudy · Chamada ao vivo" }] }),
  component: () => (
    <Suspense fallback={<p role="status">Abrindo chamada…</p>}>
      <CallScreen />
    </Suspense>
  ),
});
