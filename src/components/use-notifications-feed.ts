import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  fetchNotifications,
  subscribeToNotifications,
  type AppNotification,
} from "@/lib/notifications-model";
import { profileUpdatedEvent } from "@/lib/student-profile";
export function useNotificationsFeed(
  userId: string,
  enabled = true,
  initial: AppNotification[] = [],
) {
  const [notifications, setNotifications] = useState<AppNotification[]>(initial);
  const [error, setError] = useState("");
  const reload = useRef(() => {});

  useEffect(() => {
    if (!userId || !enabled) return;
    let cancelled = false;

    const refresh = () => {
      void fetchNotifications(userId)
        .then((items) => {
          if (!cancelled) {
            setNotifications(items);
            setError("");
          }
        })
        .catch((cause) => {
          if (!cancelled)
            setError(
              cause instanceof Error ? cause.message : "Não foi possível carregar notificações.",
            );
        });
    };
    reload.current = refresh;
    refresh();

    const unsubscribe = subscribeToNotifications(userId, (newNotification) => {
      setNotifications((prev) =>
        prev.some((item) => item.id === newNotification.id) ? prev : [newNotification, ...prev],
      );
      if (newNotification.type !== "missed_call")
        toast.info(newNotification.title, { description: newNotification.body });
    });
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 10000);
    window.addEventListener("focus", refresh);
    window.addEventListener("gstudy-social-updated", refresh);
    window.addEventListener(profileUpdatedEvent, refresh);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("gstudy-social-updated", refresh);
      window.removeEventListener(profileUpdatedEvent, refresh);
    };
  }, [userId, enabled]);

  return { notifications, setNotifications, error, setError, reload };
}
