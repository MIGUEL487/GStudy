import { useState, useEffect, useRef } from "react";
import { Send, X, Check, CheckCheck, MoreHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { toast } from "sonner";
import {
  fetchDirectMessages,
  sendDirectMessage,
  markDirectMessagesAsRead,
  subscribeToDirectMessages,
  type DirectMessage,
} from "@/lib/direct-messages-model";
import type { UserProfile } from "@/lib/social-model";
import { blockUser, reportUser } from "@/lib/social-model";
import { signalSocialUpdate } from "@/lib/social-inbox";
import "@/styles/sessions-and-social.css";

interface DirectMessagesModalProps {
  currentUserId: string;
  friend: UserProfile;
  onClose: () => void;
}

export function DirectMessagesModal({ currentUserId, friend, onClose }: DirectMessagesModalProps) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(""),
    [reporting, setReporting] = useState(false),
    [reason, setReason] = useState(""),
    [moderating, setModerating] = useState(false);
  const follow = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchDirectMessages(currentUserId, friend.id)
      .then((items) => {
        if (cancelled) return;
        setMessages(items);
        void markDirectMessagesAsRead(currentUserId, friend.id).catch((cause) => {
          if (!cancelled) setError(cause.message);
        });
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            cause instanceof Error ? cause.message : "Não foi possível carregar a conversa.",
          );
      });

    const unsubscribe = subscribeToDirectMessages(currentUserId, friend.id, (msg) => {
      if (cancelled) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (msg.recipientId === currentUserId) {
        void markDirectMessagesAsRead(currentUserId, friend.id).catch((cause) => {
          if (!cancelled) setError(cause.message);
        });
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [currentUserId, friend.id]);

  useEffect(() => {
    if (scrollRef.current && follow.current) {
      if (typeof scrollRef.current.scrollTo === "function") {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
      } else {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;

    setSending(true);
    const sent = await sendDirectMessage(currentUserId, friend.id, clean);
    setSending(false);

    if (sent) {
      follow.current = true;
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setText("");
    } else {
      toast.error("Não foi possível enviar a mensagem.");
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case "online":
        return "bg-emerald-500";
      case "studying":
        return "bg-amber-500";
      case "busy":
        return "bg-red-500";
      default:
        return "bg-zinc-400";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "online":
        return "Online";
      case "studying":
        return "Estudando agora";
      case "busy":
        return "Ocupado";
      default:
        return "Offline";
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="dm-modal-card dm-accessible" aria-describedby={undefined}>
        <header className="dm-header">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-accent/20 text-accent font-semibold flex items-center justify-center text-sm border border-border">
                {friend.displayName.slice(0, 2).toUpperCase()}
              </div>
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface ${getStatusDot(
                  friend.status,
                )}`}
              />
            </div>
            <div>
              <DialogTitle className="font-semibold text-sm leading-tight text-foreground">
                <span className="sr-only">Conversa com </span>
                {friend.displayName}
              </DialogTitle>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span>@{friend.username}</span>
                <span>·</span>
                <span>{getStatusText(friend.status)}</span>
              </p>
            </div>
          </div>

          <details className="dm-options">
            <summary aria-label="Opções da conversa">
              <MoreHorizontal size={18} />
            </summary>
            <div>
              <button
                disabled={moderating}
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Bloquear ${friend.displayName}? Vocês deixarão de trocar mensagens e chamadas.`,
                    )
                  )
                    return;
                  setModerating(true);
                  try {
                    await blockUser(currentUserId, friend.id);
                    signalSocialUpdate();
                    onClose();
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Não foi possível bloquear esta pessoa.",
                    );
                  } finally {
                    setModerating(false);
                  }
                }}
              >
                Bloquear pessoa
              </button>
              <button
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  setReporting(true);
                }}
              >
                Denunciar pessoa
              </button>
            </div>
          </details>
          <button
            type="button"
            className="header-badge-btn"
            onClick={onClose}
            aria-label="Fechar conversa"
          >
            <X size={18} />
          </button>
        </header>

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {reporting && (
          <form
            className="dm-report"
            onSubmit={async (event) => {
              event.preventDefault();
              setModerating(true);
              try {
                await reportUser(currentUserId, friend.id, reason);
                toast.success("Denúncia registrada.");
                setReporting(false);
                setReason("");
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : "Não foi possível enviar a denúncia.",
                );
              } finally {
                setModerating(false);
              }
            }}
          >
            <label>
              Motivo da denúncia
              <input
                value={reason}
                minLength={3}
                maxLength={200}
                required
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button disabled={moderating || reason.trim().length < 3}>Enviar denúncia</button>
          </form>
        )}
        <div
          className="dm-messages-container"
          ref={scrollRef}
          onScroll={() => {
            const node = scrollRef.current;
            if (node) follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
          }}
        >
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <p className="text-sm font-medium text-foreground mb-1">
                Início da conversa com {friend.displayName}
              </p>
              <p className="text-xs max-w-xs">
                Troquem dicas, dúvidas e notas de estudo. Suas mensagens são privadas e protegidas.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isMine = m.senderId === currentUserId;
              return (
                <div key={m.id} className={`dm-bubble ${isMine ? "mine" : "theirs"}`}>
                  <p>{m.content}</p>
                  <div className="flex items-center justify-end gap-1 mt-1 text-[10px] opacity-70">
                    <span>
                      {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {isMine &&
                      (m.readAt ? (
                        <CheckCheck size={12} className="text-foreground" />
                      ) : (
                        <Check size={12} />
                      ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form className="dm-footer" onSubmit={handleSend}>
          <input
            type="text"
            className="flex-1 min-h-[44px] px-3.5 bg-background border border-border rounded-md text-foreground text-sm focus:outline-none focus:border-accent"
            placeholder={`Mensagem para ${friend.displayName}...`}
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="onboarding-next-btn min-h-[44px] px-4"
            disabled={!text.trim() || sending}
            aria-label="Enviar mensagem"
          >
            <Send size={16} />
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
