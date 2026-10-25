import { useNotificationsFeed } from "./use-notifications-feed";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Check, CheckCheck, Trash2, X, UserPlus, Radio, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type AppNotification,
} from "@/lib/notifications-model";
import { acceptFriendRequest, removeFriendship } from "@/lib/social-model";
import { confirmSchoolYearAdvance } from "@/lib/student-profile";
import { schoolYearSchema } from "@/lib/school-year";
import { signalSocialUpdate } from "@/lib/social-inbox";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import "@/styles/sessions-and-social.css";

interface NotificationsPopoverProps {
  userId: string;
  initial: AppNotification[];
}

export default function NotificationsPanel({ userId, initial }: NotificationsPopoverProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const { notifications, setNotifications, error, setError, reload } = useNotificationsFeed(
    userId,
    true,
    initial,
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead(userId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success("Todas as notificações foram marcadas como lidas.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível marcar notificações como lidas.",
      );
    }
  };

  const handleAcceptFriend = async (notification: AppNotification) => {
    const friendshipId = notification.data?.["friendship_id"] as string;
    if (!friendshipId) return;

    try {
      await acceptFriendRequest(friendshipId);
      await markNotificationAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
      toast.success("Pedido de amizade aceito!");
      signalSocialUpdate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao aceitar pedido.");
    }
  };

  const handleRejectFriend = async (notification: AppNotification) => {
    const friendshipId = notification.data?.["friendship_id"] as string;
    if (!friendshipId) return;

    try {
      await removeFriendship(friendshipId);
      await markNotificationAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
      toast.info("Pedido de amizade recusado.");
      signalSocialUpdate();
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
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) reload.current();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="header-badge-btn"
          aria-label="Abrir notificações"
          title="Notificações"
        >
          <Bell size={20} strokeWidth={1.8} />
          {unreadCount > 0 && <span className="header-badge-counter">{unreadCount}</span>}
        </button>
      </PopoverTrigger>

      {open && (
        <PopoverContent
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="notifications-popover"
          role="dialog"
          aria-label="Painel de notificações"
        >
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
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
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
                      {n.type === "year_rollover" && (
                        <div className="notification-year-actions">
                          {!n.read &&
                            schoolYearSchema.safeParse(n.data?.["schoolYear"]).success && (
                              <button
                                onClick={async () => {
                                  const year = String(n.data!["schoolYear"]);
                                  if (!(await confirmSchoolYearAdvance(year))) {
                                    setError("Não foi possível confirmar sua etapa escolar.");
                                    return;
                                  }
                                  try {
                                    await markNotificationAsRead(n.id);
                                    setNotifications((rows) =>
                                      rows.map((row) =>
                                        row.id === n.id ? { ...row, read: true } : row,
                                      ),
                                    );
                                  } catch (cause) {
                                    setError(
                                      cause instanceof Error
                                        ? cause.message
                                        : "Não foi possível atualizar a notificação.",
                                    );
                                  }
                                }}
                              >
                                Confirmar
                              </button>
                            )}
                          <button
                            onClick={() => {
                              setOpen(false);
                              void navigate({ to: "/configuracoes", search: { tab: "profile" } });
                            }}
                          >
                            Alterar
                          </button>
                        </div>
                      )}
                      {n.type === "game_challenge" &&
                        typeof n.data?.["challengeId"] === "string" &&
                        /^[0-9a-f-]{36}$/i.test(n.data["challengeId"]) && (
                          <button
                            className="duo-btn ghost"
                            onClick={() => {
                              void markNotificationAsRead(n.id)
                                .then(() =>
                                  setNotifications((current) =>
                                    current.map((item) =>
                                      item.id === n.id ? { ...item, read: true } : item,
                                    ),
                                  ),
                                )
                                .catch(() => {});
                              setOpen(false);
                              void navigate({
                                to: "/sessoes",
                                search: { tab: "games", challenge: String(n.data!["challengeId"]) },
                              });
                            }}
                          >
                            Abrir desafio
                          </button>
                        )}

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
        </PopoverContent>
      )}
    </Popover>
  );
}
