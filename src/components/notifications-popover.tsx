import { lazy, Suspense, useState } from "react";
import { Bell } from "lucide-react";
import { useNotificationsFeed } from "./use-notifications-feed";
const Panel = lazy(() => import("./notifications-panel"));
export function NotificationsPopover({ userId }: { userId: string }) {
  const [activated, setActivated] = useState(false);
  const { notifications } = useNotificationsFeed(userId, !activated);
  const count = notifications.filter((row) => !row.read).length;
  const trigger = (
    <button
      type="button"
      className="header-badge-btn"
      aria-label="Abrir notificações"
      title="Notificações"
      disabled={activated}
      onClick={() => setActivated(true)}
    >
      <Bell size={20} strokeWidth={1.8} />
      {count > 0 && <span className="header-badge-counter">{count}</span>}
    </button>
  );
  return activated ? (
    <Suspense fallback={trigger}>
      <Panel userId={userId} initial={notifications} />
    </Suspense>
  ) : (
    trigger
  );
}
