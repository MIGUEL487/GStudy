import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { m, AnimatePresence } from "motion/react";
import { Radio, Users, Gamepad2 } from "lucide-react";
import { StudyRoomsView } from "./study-rooms-view";
import { motionTokens } from "@/lib/motion";
const SocialFriendsPanel = lazy(() =>
  import("./social-friends-panel").then((module) => ({ default: module.SocialFriendsPanel })),
);
import "@/styles/sessions-and-social.css";

export type SessionTab = "rooms" | "groups";

interface SessionsViewProps {
  initialTab?: SessionTab;
}

export function SessionsView({ initialTab = "rooms" }: SessionsViewProps) {
  const [tab, setTab] = useState<SessionTab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  return (
    <div className="sessions-container space-y-6">
      <header className="sessions-heading">
        <div>
          <h1>Sessões</h1>
          <p className="text-sm text-muted-foreground">
            Um lugar para estudar junto. Escolha uma sala ou reúna seu grupo.
          </p>
        </div>

        {/* Segmented Control */}
        <div className="sessions-navigation">
          <div
            className="sessions-segmented-nav"
            role="tablist"
            aria-label="Modalidade de estudo coletivo"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "rooms"}
              className={`sessions-segmented-btn ${tab === "rooms" ? "active" : ""}`}
              onClick={() => setTab("rooms")}
            >
              <Radio size={16} />
              <span>Salas</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "groups"}
              className={`sessions-segmented-btn ${tab === "groups" ? "active" : ""}`}
              onClick={() => setTab("groups")}
            >
              <Users size={16} />
              <span>Grupos</span>
            </button>
          </div>
          <Link to="/jogos" className="sessions-games-link" aria-label="Abrir página de jogos">
            <Gamepad2 size={16} />
            <span>Jogos</span>
          </Link>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={tab}
          className="sessions-panel"
          role="tabpanel"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{
            duration: motionTokens.duration.quick,
            ease: motionTokens.easing.editorial,
          }}
        >
          {tab === "rooms" && <StudyRoomsView />}
          {tab === "groups" && (
            <Suspense fallback={<p role="status">Carregando grupos…</p>}>
              <SocialFriendsPanel initialTab="groups" groupsOnly />
            </Suspense>
          )}
        </m.div>
      </AnimatePresence>
    </div>
  );
}
