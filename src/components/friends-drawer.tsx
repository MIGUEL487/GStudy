import { lazy, Suspense, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { getSocialInbox, subscribeSocialInbox } from "@/lib/social-inbox";
const Panel = lazy(() => import("./friends-panel"));
export function FriendsDrawer({ userId }: { userId: string }) {
  return <FriendsEntry key={userId} userId={userId} />;
}
function FriendsEntry({ userId }: { userId: string }) {
  const [activated, setActivated] = useState(false);
  const [inbox, setInbox] = useState<Awaited<ReturnType<typeof getSocialInbox>>>({
    pending: 0,
    unread: {},
  });
  const [error, setError] = useState("");
  useEffect(() => {
    if (activated) return;
    let alive = true;
    const refresh = () => {
      void getSocialInbox()
        .then((value) => {
          if (alive) {
            setInbox(value);
            setError("");
          }
        })
        .catch((cause) => {
          if (alive)
            setError(
              cause instanceof Error
                ? cause.message
                : "Não foi possível atualizar pedidos e mensagens.",
            );
        });
    };
    refresh();
    const stop = subscribeSocialInbox(userId, refresh);
    return () => {
      alive = false;
      stop();
    };
  }, [userId, activated]);
  const count = inbox.pending + Object.values(inbox.unread).reduce((sum, value) => sum + value, 0);
  const trigger = (
    <button
      type="button"
      className="header-badge-btn"
      aria-label={count ? `Abrir amigos de estudo, ${count} pendências` : "Abrir amigos de estudo"}
      title={error || "Amigos e mensagens"}
      disabled={activated}
      onClick={() => setActivated(true)}
    >
      <Users size={20} strokeWidth={1.8} />
      {count > 0 && <span className="header-badge-counter">{count}</span>}
    </button>
  );
  return activated ? (
    <Suspense fallback={trigger}>
      <Panel userId={userId} initialInbox={inbox} initialError={error} />
    </Suspense>
  ) : (
    trigger
  );
}
