import { lazy, Suspense, useEffect, useState } from "react";
import { m, AnimatePresence } from "motion/react";
import { Radio, Users, Gamepad2 } from "lucide-react";
import { StudyRoomsView } from "./study-rooms-view";
import { SocialFriendsPanel } from "./social-friends-panel";
import type { GameLaunch } from "@/lib/games/types";
const GameCatalog = lazy(() =>
  import("./games/game-catalog").then((module) => ({ default: module.GameCatalog })),
);
import "@/styles/sessions-and-social.css";

export type SessionTab = "rooms" | "groups" | "games";

interface SessionsViewProps {
  initialTab?: SessionTab;
  initialGame?: GameLaunch | undefined;
}

export function SessionsView({ initialTab = "rooms", initialGame }: SessionsViewProps) {
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
          <button
            type="button"
            role="tab"
            aria-selected={tab === "games"}
            className={`sessions-segmented-btn ${tab === "games" ? "active" : ""}`}
            onClick={() => setTab("games")}
          >
            <Gamepad2 size={16} />
            <span>Jogos</span>
          </button>
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
          transition={{ duration: 0.15 }}
        >
          {tab === "rooms" && <StudyRoomsView />}
          {tab === "groups" && <SocialFriendsPanel initialTab="groups" groupsOnly />}
          {tab === "games" && (
            <Suspense fallback={<p role="status">Carregando jogos…</p>}>
              <GameCatalog initialLaunch={initialGame} />
            </Suspense>
          )}
        </m.div>
      </AnimatePresence>
    </div>
  );
}
