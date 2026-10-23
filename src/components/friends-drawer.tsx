import { useState, useEffect, useCallback } from "react";
import {
  Users,
  X,
  UserPlus,
  MessageCircle,
  Check,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
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
import { DirectMessagesModal } from "./direct-messages-modal";
import "@/styles/sessions-and-social.css";

interface FriendsDrawerProps {
  userId: string;
}

export function FriendsDrawer({ userId }: FriendsDrawerProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"friends" | "requests" | "add">("friends");

  const [friends, setFriends] = useState<Friendship[]>([]);
  const [incoming, setIncoming] = useState<Friendship[]>([]);
  const [outgoing, setOutgoing] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchUserResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [searchNotFound, setSearchNotFound] = useState(false);

  // DM state
  const [activeChatFriend, setActiveChatFriend] = useState<UserProfile | null>(null);

  const loadSocialData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [fList, reqs] = await Promise.all([listFriends(userId), listPendingRequests(userId)]);
      setFriends(fList);
      setIncoming(reqs.incoming);
      setOutgoing(reqs.outgoing);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open) {
      void loadSocialData();
    }
  }, [open, loadSocialData]);

  // Initial count of incoming requests for header badge
  useEffect(() => {
    if (!userId) return;
    void listPendingRequests(userId).then((reqs) => {
      setIncoming(reqs.incoming);
    });
  }, [userId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query || searching) return;

    setSearching(true);
    setSearchResult(null);
    setSearchNotFound(false);

    try {
      const result = await searchUserExact(query);
      if (result) {
        setSearchResult(result);
      } else {
        setSearchNotFound(true);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro na busca.");
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (targetId: string) => {
    if (sendingRequest) return;
    setSendingRequest(true);
    try {
      await sendFriendRequest(userId, targetId);
      toast.success("Pedido de amizade enviado!");
      setSearchResult(null);
      setSearchQuery("");
      await loadSocialData();
      setActiveTab("requests");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar o pedido.");
    } finally {
      setSendingRequest(false);
    }
  };

  const handleAccept = async (friendshipId: string) => {
    try {
      await acceptFriendRequest(friendshipId);
      toast.success("Amizade aceita!");
      await loadSocialData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao aceitar pedido.");
    }
  };

  const handleReject = async (friendshipId: string) => {
    try {
      await removeFriendship(friendshipId);
      toast.info("Pedido recusado.");
      await loadSocialData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao recusar pedido.");
    }
  };

  const getStatusDot = (status?: string) => {
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

  return (
    <>
      <button
        type="button"
        className="header-badge-btn"
        aria-label="Abrir amigos de estudo"
        title="Amigos e Mensagens"
        onClick={() => setOpen(true)}
      >
        <Users size={20} strokeWidth={1.8} />
        {incoming.length > 0 && <span className="header-badge-counter">{incoming.length}</span>}
      </button>

      {open && (
        <>
          <div className="drawer-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />

          <aside className="drawer-panel" role="dialog" aria-label="Amigos e conexões">
            <header className="drawer-header">
              <div className="flex items-center gap-2">
                <Users size={20} className="text-accent" />
                <h2 className="drawer-title">Amigos de Estudo</h2>
              </div>
              <button
                type="button"
                className="header-badge-btn"
                onClick={() => setOpen(false)}
                aria-label="Fechar painel de amigos"
              >
                <X size={18} />
              </button>
            </header>

            <nav className="drawer-tabs" aria-label="Abas de amigos">
              <button
                type="button"
                className={`drawer-tab-btn ${activeTab === "friends" ? "active" : ""}`}
                onClick={() => setActiveTab("friends")}
              >
                Amigos ({friends.length})
              </button>
              <button
                type="button"
                className={`drawer-tab-btn ${activeTab === "requests" ? "active" : ""}`}
                onClick={() => setActiveTab("requests")}
              >
                Pedidos {incoming.length > 0 && `(${incoming.length})`}
              </button>
              <button
                type="button"
                className={`drawer-tab-btn ${activeTab === "add" ? "active" : ""}`}
                onClick={() => setActiveTab("add")}
              >
                + Adicionar
              </button>
            </nav>

            <div className="drawer-body">
              {activeTab === "friends" && (
                <div className="space-y-3">
                  {friends.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                      <p className="text-sm font-medium text-foreground mb-1">
                        Nenhum amigo adicionado ainda.
                      </p>
                      <p className="text-xs max-w-xs mx-auto mb-4">
                        Adicione seus colegas para estudar juntos em salas, ver o status ao vivo e
                        trocar mensagens.
                      </p>
                      <button
                        type="button"
                        className="onboarding-next-btn text-xs py-2 px-3 mx-auto"
                        onClick={() => setActiveTab("add")}
                      >
                        <UserPlus size={14} />
                        <span>Adicionar colega</span>
                      </button>
                    </div>
                  ) : (
                    friends.map((f) => {
                      const prof = f.profile;
                      if (!prof) return null;
                      return (
                        <div
                          key={f.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border hover:border-accent transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="w-10 h-10 rounded-full bg-accent/20 text-accent font-semibold flex items-center justify-center text-sm border border-border">
                                {prof.displayName.slice(0, 2).toUpperCase()}
                              </div>
                              <span
                                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface ${getStatusDot(
                                  prof.status,
                                )}`}
                              />
                            </div>
                            <div>
                              <p className="font-semibold text-sm text-foreground">
                                {prof.displayName}
                              </p>
                              <p className="text-xs text-muted-foreground">@{prof.username}</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="p-2 text-muted-foreground hover:text-accent rounded-md hover:bg-surface-hover cursor-pointer border-none bg-transparent"
                            title={`Conversar com ${prof.displayName}`}
                            onClick={() => setActiveChatFriend(prof)}
                          >
                            <MessageCircle size={18} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeTab === "requests" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Recebidos ({incoming.length})
                    </h3>
                    {incoming.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        Nenhum pedido pendente recebido.
                      </p>
                    ) : (
                      incoming.map((req) => (
                        <div
                          key={req.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border mb-2"
                        >
                          <div>
                            <p className="font-semibold text-sm text-foreground">
                              {req.profile?.displayName || req.profile?.username || "Estudante"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              @{req.profile?.username || "usuario"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              className="p-1.5 bg-accent text-[#17130f] rounded hover:opacity-90 border-none cursor-pointer"
                              title="Aceitar pedido"
                              onClick={() => handleAccept(req.id)}
                            >
                              <Check size={16} />
                            </button>
                            <button
                              type="button"
                              className="p-1.5 bg-surface text-muted-foreground hover:text-foreground rounded border border-border cursor-pointer"
                              title="Recusar pedido"
                              onClick={() => handleReject(req.id)}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {outgoing.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Enviados ({outgoing.length})
                      </h3>
                      {outgoing.map((req) => (
                        <div
                          key={req.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border opacity-75 mb-2"
                        >
                          <div>
                            <p className="font-semibold text-sm text-foreground">
                              {req.profile?.displayName || req.profile?.username || "Estudante"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              @{req.profile?.username || "usuario"}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock size={12} /> Pendente
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "add" && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Encontre seus colegas pelo @username exato ou e-mail exato cadastrado.
                  </p>

                  <form onSubmit={handleSearch} className="flex gap-2">
                    <input
                      type="text"
                      className="onboarding-text-input flex-1 min-h-[44px] text-sm"
                      placeholder="Ex: @mariana ou email exato"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="onboarding-next-btn min-h-[44px] px-3.5"
                      disabled={!searchQuery.trim() || searching}
                      aria-label="Buscar usuário"
                    >
                      <Search size={16} />
                    </button>
                  </form>

                  {searching && (
                    <p className="text-xs text-muted-foreground py-2 flex items-center gap-1.5">
                      <Clock size={12} className="animate-spin" /> Buscando estudante...
                    </p>
                  )}

                  {searchNotFound && (
                    <div className="p-4 rounded-lg bg-surface border border-border text-center text-xs text-muted-foreground">
                      <AlertCircle size={16} className="mx-auto mb-1 text-muted-foreground" />
                      Nenhum estudante encontrado com esse identificador exato.
                    </div>
                  )}

                  {searchResult && (
                    <div className="p-4 rounded-lg bg-surface border border-accent/40 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm text-foreground">
                          {searchResult.displayName || searchResult.username}
                        </p>
                        <p className="text-xs text-muted-foreground">@{searchResult.username}</p>
                      </div>

                      <button
                        type="button"
                        className="onboarding-next-btn text-xs py-2 px-3"
                        disabled={sendingRequest || searchResult.id === userId}
                        onClick={() => handleSendRequest(searchResult.id)}
                      >
                        <UserPlus size={14} />
                        <span>{sendingRequest ? "Enviando..." : "Adicionar Amigo"}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {activeChatFriend && (
        <DirectMessagesModal
          currentUserId={userId}
          friend={activeChatFriend}
          onClose={() => setActiveChatFriend(null)}
        />
      )}
    </>
  );
}
