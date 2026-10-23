import { useState } from "react";
import { Radio, Users, Gamepad2, Sparkles } from "lucide-react";
import { StudyRoomsView } from "./study-rooms-view";
import { SocialFriendsPanel } from "./social-friends-panel";
import { GameCatalog } from "./games/game-catalog";
import "@/styles/sessions-and-social.css";

export type SessionTab = "rooms" | "groups" | "games";

interface SessionsViewProps {
  initialTab?: SessionTab;
}

export function SessionsView({ initialTab = "rooms" }: SessionsViewProps) {
  const [tab, setTab] = useState<SessionTab>(initialTab);

  return (
    <div className="sessions-container space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Sessões Coletivas</h1>
          <p className="text-sm text-muted-foreground">
            Estude com foco compartilhado, participe de grupos ou dispute desafios de conhecimento.
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
      </div>

      {tab === "rooms" && <StudyRoomsView />}

      {tab === "groups" && <SocialFriendsPanel initialTab="groups" />}

      {tab === "games" && <GameCatalog />}
    </div>
  );
}
