import { useCallback, useEffect, useRef, useState } from "react";
import { Users, UserPlus, MessageCircle, Check, X, Search } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  listFriends,
  listPendingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
  searchUserExact,
  type Friendship,
  type UserProfile,
  type SearchUserResult,
} from "@/lib/social-model";
import { getSocialInbox, subscribeSocialInbox, signalSocialUpdate } from "@/lib/social-inbox";
import { DirectMessagesModal } from "./direct-messages-modal";
import "@/styles/sessions-and-social.css";

const statuses = {
  online: "Online",
  studying: "Estudando agora",
  busy: "Ocupado",
  offline: "Offline",
};
export function FriendsDrawer({ userId }: { userId: string }) {
  return <FriendsPanel key={userId} userId={userId} />;
}
function FriendsPanel({ userId }: { userId: string }) {
  const mobile = useIsMobile(),
    alive = useRef(true),
    refreshing = useRef(false);
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState<"friends" | "requests" | "add">("friends");
  const [friends, setFriends] = useState<Friendship[]>([]),
    [incoming, setIncoming] = useState<Friendship[]>([]),
    [outgoing, setOutgoing] = useState<Friendship[]>([]);
  const [inbox, setInbox] = useState<Awaited<ReturnType<typeof getSocialInbox>>>({
    pending: 0,
    unread: {},
  });
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [result, setResult] = useState<SearchUserResult | null>(null),
    [searched, setSearched] = useState(false);
  const [chat, setChat] = useState<UserProfile | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const refresh = useCallback(async () => {
    if (!userId || refreshing.current) return;
    refreshing.current = true;
    try {
      const next = await getSocialInbox();
      if (alive.current) setInbox(next);
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível atualizar pedidos e mensagens.",
        );
    }
    if (openRef.current) {
      setLoading(true);
      try {
        const [nextFriends, requests] = await Promise.all([
          listFriends(userId),
          listPendingRequests(userId),
        ]);
        if (alive.current) {
          setFriends(nextFriends);
          setIncoming(requests.incoming);
          setOutgoing(requests.outgoing);
        }
      } catch (cause) {
        if (alive.current)
          setError(
            cause instanceof Error ? cause.message : "Não foi possível atualizar seus amigos.",
          );
      } finally {
        if (alive.current) setLoading(false);
      }
    }
    refreshing.current = false;
  }, [userId]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const stop = subscribeSocialInbox(userId, () => void refresh());
    return () => {
      alive.current = false;
      stop();
    };
  }, [userId, refresh]);
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);
  const act = async (key: string, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setError("");
    try {
      await task();
      signalSocialUpdate();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível completar esta ação.");
    } finally {
      setBusy("");
    }
  };
  const requests = (rows: Friendship[], sent = false) =>
    rows.map((item) => (
      <article className="friend-row" key={item.id}>
        <div>
          <strong>{item.profile?.displayName ?? "Estudante"}</strong>
          <small>@{item.profile?.username ?? "usuário"}</small>
        </div>
        <div className="friend-actions">
          {!sent && (
            <button
              disabled={Boolean(busy)}
              aria-label="Aceitar pedido"
              title="Aceitar pedido"
              onClick={() => void act(item.id, () => acceptFriendRequest(item.id))}
            >
              <Check size={18} />
            </button>
          )}
          <button
            disabled={Boolean(busy)}
            aria-label={sent ? "Cancelar pedido" : "Recusar pedido"}
            title={sent ? "Cancelar pedido" : "Recusar pedido"}
            onClick={() => void act(item.id, () => removeFriendship(item.id))}
          >
            {sent ? "Cancelar" : <X size={18} />}
          </button>
        </div>
      </article>
    ));
  const pending = Math.max(inbox.pending, incoming.length);
  const count = pending + Object.values(inbox.unread).reduce((sum, n) => sum + n, 0);
  return (
    <>
      <button
        type="button"
        className="header-badge-btn"
        aria-label={
          count ? `Abrir amigos de estudo, ${count} pendências` : "Abrir amigos de estudo"
        }
        title="Amigos e mensagens"
        onClick={() => setOpen(true)}
      >
        <Users size={20} strokeWidth={1.8} />
        {count > 0 && <span className="header-badge-counter">{count}</span>}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={mobile ? "bottom" : "right"}
          className="friends-sheet"
          closeLabel="Fechar painel de amigos"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            if (chat) event.preventDefault();
          }}
        >
          <header className="drawer-header">
            <SheetTitle>Amigos de Estudo</SheetTitle>
          </header>
          <nav className="drawer-tabs" aria-label="Abas de amigos" role="tablist">
            {(
              [
                ["friends", `Amigos (${friends.length})`],
                ["requests", `Pedidos${inbox.pending ? ` (${inbox.pending})` : ""}`],
                ["add", "+ Adicionar"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={`drawer-tab-btn ${tab === id ? "active" : ""}`}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="drawer-body" role="tabpanel">
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            {loading && <p role="status">Atualizando amigos…</p>}
            {tab === "friends" && (
              <>
                {!loading && !friends.length && (
                  <div className="social-empty-state">
                    <p>Nenhum amigo adicionado ainda.</p>
                    <p>Adicione seus colegas para estudar e conversar.</p>
                    <button onClick={() => setTab("add")}>
                      <UserPlus size={16} />
                      Adicionar colega
                    </button>
                  </div>
                )}
                {friends.map((friend) => {
                  const profile = friend.profile;
                  if (!profile) return null;
                  const unread = inbox.unread[profile.id] ?? 0;
                  return (
                    <article className="friend-row" key={friend.id}>
                      <span className="friend-avatar">
                        {profile.avatarUrl ? (
                          <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          profile.displayName.slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <div>
                        <strong>{profile.displayName}</strong>
                        <small>@{profile.username}</small>
                        <small>{statuses[profile.status]}</small>
                      </div>
                      <button
                        aria-label={`Conversar com ${profile.displayName}${unread ? `, ${unread} mensagens não lidas` : ""}`}
                        title={`Conversar com ${profile.displayName}`}
                        onClick={() => {
                          setOpen(false);
                          setChat(profile);
                        }}
                      >
                        <MessageCircle size={18} />
                        {unread > 0 && <span>{unread}</span>}
                      </button>
                    </article>
                  );
                })}
              </>
            )}
            {tab === "requests" && (
              <>
                <h3>Recebidos ({incoming.length})</h3>
                {!incoming.length && <p>Nenhum pedido pendente recebido.</p>}
                {requests(incoming)}
                <h3>Enviados ({outgoing.length})</h3>
                {!outgoing.length && <p>Nenhum pedido pendente enviado.</p>}
                {requests(outgoing, true)}
              </>
            )}
            {tab === "add" && (
              <>
                <p>Encontre colegas pelo @username ou e-mail exato cadastrado.</p>
                <form
                  className="friend-search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void act("search", async () => {
                      setResult(null);
                      setSearched(false);
                      const found = await searchUserExact(query.trim());
                      setResult(found);
                      setSearched(true);
                    });
                  }}
                >
                  <label>
                    Username ou e-mail
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Ex: @mariana ou email exato"
                      autoComplete="off"
                      maxLength={254}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={Boolean(busy) || !query.trim()}
                    aria-label="Buscar usuário"
                  >
                    <Search size={18} />
                  </button>
                </form>
                {busy === "search" && <p role="status">Buscando estudante…</p>}
                {searched && !result && (
                  <p>Nenhum estudante encontrado com esse identificador exato.</p>
                )}
                {result && (
                  <article className="friend-row">
                    <div>
                      <strong>{result.displayName}</strong>
                      <small>@{result.username}</small>
                    </div>
                    <button
                      disabled={Boolean(busy) || result.id === userId}
                      onClick={() =>
                        void act("invite", async () => {
                          await sendFriendRequest(userId, result.id);
                          setResult(null);
                          setQuery("");
                          setTab("requests");
                          toast.success("Pedido de amizade enviado!");
                        })
                      }
                    >
                      <UserPlus size={16} />
                      Adicionar Amigo
                    </button>
                  </article>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {chat && (
        <DirectMessagesModal
          currentUserId={userId}
          friend={chat}
          onClose={() => {
            setChat(null);
            setOpen(true);
            signalSocialUpdate();
          }}
        />
      )}
    </>
  );
}
