import { useState, useEffect, useRef } from "react";
import { Bell, Check, CheckCheck, Trash2, X, UserPlus, Radio, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  fetchNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  subscribeToNotifications,
  type AppNotification,
} from "@/lib/notifications-model";
import { acceptFriendRequest, removeFriendship } from "@/lib/social-model";
import "@/styles/sessions-and-social.css";

interface NotificationsPopoverProps {
  userId: string;
}

export function NotificationsPopover({ userId }: NotificationsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void fetchNotifications(userId).then((items) => {
      if (!cancelled) setNotifications(items);
    });

    const unsubscribe = subscribeToNotifications(userId, (newNotification) => {
      setNotifications((prev) => [newNotification, ...prev]);
      toast.info(newNotification.title, { description: newNotification.body });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead(userId);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast.success("Todas as notificações foram marcadas como lidas.");
  };

  const handleAcceptFriend = async (notification: AppNotification) => {
    const friendshipId = notification.data?.friendship_id as string;
    if (!friendshipId) return;

    try {
      await acceptFriendRequest(friendshipId);
      await markNotificationAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
      toast.success("Pedido de amizade aceito!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao aceitar pedido.");
    }
  };

  const handleRejectFriend = async (notification: AppNotification) => {
    const friendshipId = notification.data?.friendship_id as string;
    if (!friendshipId) return;

    try {
      await removeFriendship(friendshipId);
      await markNotificationAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
      toast.info("Pedido de amizade recusado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao recusar pedido.");
    }
  };

  const renderIcon = (type: string) => {
    switch (type) {
      case "friend_request":
      case "friend_accepted":
        return <UserPlus size={16} className="text-accent" />;
      case "room_invite":
        return <Radio size={16} className="text-accent" />;
      case "year_rollover":
        return <Sparkles size={16} className="text-accent" />;
      default:
        return <Bell size={16} className="text-accent" />;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="header-badge-btn"
        aria-label="Abrir notificações"
        title="Notificações"
        onClick={() => setOpen(!open)}
      >
        <Bell size={20} strokeWidth={1.8} />
        {unreadCount > 0 && <span className="header-badge-counter">{unreadCount}</span>}
      </button>

      {open && (
        <div className="notifications-popover" role="dialog" aria-label="Painel de notificações">
          <header className="notifications-header">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Notificações</span>
              {unreadCount > 0 && (
                <span className="text-xs text-muted-foreground">({unreadCount} novas)</span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-accent flex items-center gap-1 cursor-pointer bg-transparent border-none"
                onClick={handleMarkAllRead}
                title="Marcar todas como lidas"
              >
                <CheckCheck size={14} />
                <span>Ler todas</span>
              </button>
            )}
          </header>

          <div className="overflow-y-auto max-h-[400px]">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Nenhuma notificação no momento.
              </div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`notification-item ${n.read ? "" : "unread"}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5">{renderIcon(n.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs text-foreground mb-0.5">{n.title}</p>
                      <p className="text-xs text-muted-foreground leading-normal">{n.body}</p>

                      {n.type === "friend_request" && !n.read && (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            type="button"
                            className="text-xs px-2.5 py-1 bg-accent text-[#17130f] rounded font-medium hover:opacity-90 flex items-center gap-1 cursor-pointer border-none"
                            onClick={() => handleAcceptFriend(n)}
                          >
                            <Check size={12} />
                            <span>Aceitar</span>
                          </button>
                          <button
                            type="button"
                            className="text-xs px-2.5 py-1 bg-surface hover:bg-surface-hover text-muted-foreground rounded border border-border flex items-center gap-1 cursor-pointer"
                            onClick={() => handleRejectFriend(n)}
                          >
                            <X size={12} />
                            <span>Recusar</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
