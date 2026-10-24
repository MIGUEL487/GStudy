import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  ShieldAlert,
  Ban,
  Clock,
  Sparkles,
  Search,
  Check,
  X,
  PlusCircle,
  Copy,
  Trophy,
  Medal,
  Award,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "./auth-gate";
import { Avatar } from "./avatar";
import {
  isSocialFeatureEnabled,
  listFriends,
  listPendingRequests,
  searchUserExact,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
  blockUser,
  reportUser,
  createStudyGroup,
  joinGroupByCode,
  listMyGroups,
  type Friendship,
  type StudyGroup,
  type SearchUserResult,
} from "@/lib/social-model";
import {
  getSocialLeaderboard,
  listUserAchievements,
  updateRankingVisibility,
  type LeaderboardEntry,
  type SocialAchievement,
  type RankingVisibility,
} from "@/lib/social-gamification-model";
import "@/styles/social-friends.css";
import { StartCallButton } from "./voice/voice-controls";

type Tab = "friends" | "pending" | "search" | "groups" | "ranking";

export function SocialFriendsPanel({
  initialTab = "friends",
  groupsOnly = false,
}: { initialTab?: Tab; groupsOnly?: boolean } = {}) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(false);

  const [friends, setFriends] = useState<Friendship[]>([]);
  const [pending, setPending] = useState<{ incoming: Friendship[]; outgoing: Friendship[] }>({
    incoming: [],
    outgoing: [],
  });
  const [groups, setGroups] = useState<StudyGroup[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchUserResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchExecuted, setSearchExecuted] = useState(false);

  // Modals state
  const [blockModalTarget, setBlockModalTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [blockReason, setBlockReason] = useState("");

  const [reportModalTarget, setReportModalTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState("Comportamento inadequado");
  const [reportDetails, setReportDetails] = useState("");

  // Group creation modal
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [joinCode, setJoinCode] = useState("");

  // Ranking & Gamification state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [achievements, setAchievements] = useState<SocialAchievement[]>([]);
  const [rankingScope, setRankingScope] = useState<"friends" | "group">("friends");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [rankingVisibility, setRankingVisibility] = useState<RankingVisibility>("public");

  const loadData = useCallback(async () => {
    if (!user?.id || !isSocialFeatureEnabled()) return;
    setLoading(true);
    try {
      const [friendsList, pendingReqs, myGroups] = await Promise.all([
        listFriends(user.id),
        listPendingRequests(user.id),
        listMyGroups(user.id),
      ]);
      setFriends(friendsList);
      setPending(pendingReqs);
      setGroups(myGroups);
      if (myGroups.length > 0 && !selectedGroupId) {
        setSelectedGroupId(myGroups[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, selectedGroupId]);

  const loadRanking = useCallback(async () => {
    if (!user?.id || !isSocialFeatureEnabled()) return;
    try {
      const [lb, achs] = await Promise.all([
        getSocialLeaderboard(rankingScope, selectedGroupId || undefined),
        listUserAchievements(user.id),
      ]);
      setLeaderboard(lb);
      setAchievements(achs);
    } catch (err) {
      console.error(err);
    }
  }, [user?.id, rankingScope, selectedGroupId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (tab === "ranking") {
      void loadRanking();
    }
  }, [tab, loadRanking]);

  const handleUpdateVisibility = async (newVis: RankingVisibility) => {
    if (!user?.id) return;
    setRankingVisibility(newVis);
    try {
      await updateRankingVisibility(user.id, newVis);
      toast.success("Privacidade no ranking atualizada!");
      void loadRanking();
    } catch (err) {
      toast.error("Erro ao atualizar visibilidade.");
    }
  };

  if (!isSocialFeatureEnabled()) {
    return null;
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchExecuted(true);
    setSearchResult(null);

    try {
      const result = await searchUserExact(searchQuery);
      setSearchResult(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na busca.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddFriend = async (targetId: string) => {
    if (!user?.id) return;
    try {
      await sendFriendRequest(user.id, targetId);
      toast.success("Pedido de amizade enviado!");
      setSearchResult(null);
      setSearchQuery("");
      setSearchExecuted(false);
      void loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível adicionar.");
    }
  };

  const handleAccept = async (friendshipId: string) => {
    try {
      await acceptFriendRequest(friendshipId);
      toast.success("Amizade aceita com sucesso!");
      void loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aceitar.");
    }
  };

  const handleRemove = async (friendshipId: string) => {
    try {
      await removeFriendship(friendshipId);
      toast.success("Amizade desfeita.");
      void loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  const handleConfirmBlock = async () => {
    if (!user?.id || !blockModalTarget) return;
    try {
      await blockUser(user.id, blockModalTarget.id, blockReason);
      toast.success(`${blockModalTarget.name} foi bloqueado.`);
      setBlockModalTarget(null);
      setBlockReason("");
      void loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao bloquear.");
    }
  };

  const handleConfirmReport = async () => {
    if (!user?.id || !reportModalTarget) return;
    try {
      await reportUser(user.id, reportModalTarget.id, reportReason, reportDetails);
      toast.success("Denúncia enviada com sucesso. Nossa equipe analisará o caso.");
      setReportModalTarget(null);
      setReportReason("Comportamento inadequado");
      setReportDetails("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao denunciar.");
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !newGroupName.trim()) return;

    try {
      const created = await createStudyGroup(user.id, newGroupName, newGroupDesc);
      toast.success(`Grupo "${created.name}" criado! Código: ${created.inviteCode}`);
      setShowCreateGroupModal(false);
      setNewGroupName("");
      setNewGroupDesc("");
      void loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar grupo.");
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !joinCode.trim()) return;

    try {
      const joined = await joinGroupByCode(user.id, joinCode);
      toast.success(`Você entrou no grupo "${joined.name}"!`);
      setJoinCode("");
      void loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido.");
    }
  };

  const pendingCount = pending.incoming.length;

  return (
    <div className="social-container">
      {!groupsOnly && (
        <>
          <div className="social-header">
            <h1>Amigos e Grupos</h1>
            <p>Estude junto, compartilhe dúvidas e acompanhe seu círculo de estudos.</p>
          </div>

          <div className="social-nav-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "friends"}
              className={`social-tab-btn ${tab === "friends" ? "active" : ""}`}
              onClick={() => setTab("friends")}
            >
              <Users size={16} />
              Meus amigos ({friends.length})
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tab === "pending"}
              className={`social-tab-btn ${tab === "pending" ? "active" : ""}`}
              onClick={() => setTab("pending")}
            >
              <Clock size={16} />
              Pendentes
              {pendingCount > 0 && <span className="social-tab-badge">{pendingCount}</span>}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tab === "search"}
              className={`social-tab-btn ${tab === "search" ? "active" : ""}`}
              onClick={() => setTab("search")}
            >
              <UserPlus size={16} />
              Adicionar
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tab === "groups"}
              className={`social-tab-btn ${tab === "groups" ? "active" : ""}`}
              onClick={() => setTab("groups")}
            >
              <Sparkles size={16} />
              Grupos ({groups.length})
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tab === "ranking"}
              className={`social-tab-btn ${tab === "ranking" ? "active" : ""}`}
              onClick={() => setTab("ranking")}
            >
              <Trophy size={16} />
              Ranking Semanal
            </button>
          </div>
        </>
      )}

      {/* Tab: Meus Amigos */}
      {tab === "friends" && (
        <div className="social-tab-content">
          {friends.length === 0 ? (
            <div className="social-empty-state">
              <h3>Você ainda não tem amigos adicionados</h3>
              <p>Busque colegas pelo @username ou e-mail exato para formar grupos de estudo.</p>
              <button
                type="button"
                className="social-btn social-btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => setTab("search")}
              >
                <UserPlus size={16} /> Adicionar amigos
              </button>
            </div>
          ) : (
            <div className="social-card-list">
              {friends.map((f) => {
                const p = f.profile;
                if (!p) return null;
                return (
                  <div key={f.id} className="social-user-card">
                    <div className="social-user-info">
                      <div className="social-avatar-wrapper">
                        <Avatar url={p.avatarUrl} name={p.displayName} size={42} />
                        <span
                          className={`status-indicator status-${p.status || "offline"}`}
                          title={`Status: ${p.status}`}
                        />
                      </div>
                      <div className="social-user-meta">
                        <h3>{p.displayName}</h3>
                        <span>@{p.username}</span>
                        {p.bio && <span className="social-user-bio">{p.bio}</span>}
                      </div>
                    </div>

                    <div className="social-user-actions">
                      <button
                        type="button"
                        className="social-btn social-btn-danger"
                        title="Desfazer amizade"
                        onClick={() => handleRemove(f.id)}
                      >
                        Desfazer
                      </button>
                      <button
                        type="button"
                        className="social-btn"
                        title="Bloquear usuário"
                        onClick={() =>
                          setBlockModalTarget({ id: p.id, name: p.displayName || p.username })
                        }
                      >
                        <Ban size={14} /> Bloquear
                      </button>
                      <button
                        type="button"
                        className="social-btn"
                        title="Denunciar usuário"
                        onClick={() =>
                          setReportModalTarget({ id: p.id, name: p.displayName || p.username })
                        }
                      >
                        <ShieldAlert size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Pendentes */}
      {tab === "pending" && (
        <div className="social-tab-content">
          <h2 style={{ fontSize: 16, marginBottom: 12, color: "#2f4a3a" }}>
            Pedidos Recebidos ({pending.incoming.length})
          </h2>
          {pending.incoming.length === 0 ? (
            <p style={{ fontSize: 13, color: "#8c7365", marginBottom: 24 }}>
              Nenhum pedido de amizade pendente.
            </p>
          ) : (
            <div className="social-card-list" style={{ marginBottom: 28 }}>
              {pending.incoming.map((f) => (
                <div key={f.id} className="social-user-card">
                  <div className="social-user-info">
                    <Avatar
                      url={f.profile?.avatarUrl}
                      name={f.profile?.displayName ?? "Aluno"}
                      size={40}
                    />
                    <div className="social-user-meta">
                      <h3>{f.profile?.displayName ?? "Aluno"}</h3>
                      <span>@{f.profile?.username}</span>
                    </div>
                  </div>
                  <div className="social-user-actions">
                    <button
                      type="button"
                      className="social-btn social-btn-primary"
                      onClick={() => handleAccept(f.id)}
                    >
                      <Check size={14} /> Aceitar
                    </button>
                    <button
                      type="button"
                      className="social-btn social-btn-danger"
                      onClick={() => handleRemove(f.id)}
                    >
                      <X size={14} /> Recusar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: 16, marginBottom: 12, color: "#2f4a3a" }}>
            Pedidos Enviados ({pending.outgoing.length})
          </h2>
          {pending.outgoing.length === 0 ? (
            <p style={{ fontSize: 13, color: "#8c7365" }}>Você não enviou pedidos pendentes.</p>
          ) : (
            <div className="social-card-list">
              {pending.outgoing.map((f) => (
                <div key={f.id} className="social-user-card">
                  <div className="social-user-info">
                    <Avatar
                      url={f.profile?.avatarUrl}
                      name={f.profile?.displayName ?? "Aluno"}
                      size={40}
                    />
                    <div className="social-user-meta">
                      <h3>{f.profile?.displayName ?? "Aluno"}</h3>
                      <span>@{f.profile?.username}</span>
                    </div>
                  </div>
                  <div className="social-user-actions">
                    <span style={{ fontSize: 12, color: "#8c7365" }}>Aguardando resposta</span>
                    <button type="button" className="social-btn" onClick={() => handleRemove(f.id)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Buscar / Adicionar */}
      {tab === "search" && (
        <div className="social-tab-content">
          <div className="social-search-box">
            <form onSubmit={handleSearch}>
              <div className="social-search-input-group">
                <input
                  type="text"
                  placeholder="Digite o @username exato ou e-mail..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button
                  type="submit"
                  className="social-btn social-btn-primary"
                  disabled={isSearching || !searchQuery.trim()}
                >
                  <Search size={16} /> {isSearching ? "Buscando..." : "Buscar"}
                </button>
              </div>
              <p className="social-search-hint">
                Por motivos de segurança e privacidade, a busca só localiza usuários por
                correspondência exata. Dados privados como e-mails nunca são expostos.
              </p>
            </form>
          </div>

          {searchExecuted && !searchResult && !isSearching && (
            <div className="social-empty-state">
              <h3>Nenhum usuário encontrado</h3>
              <p>Verifique se o @username ou e-mail foi digitado corretamente.</p>
            </div>
          )}

          {searchResult && (
            <div className="social-user-card">
              <div className="social-user-info">
                <Avatar url={searchResult.avatarUrl} name={searchResult.displayName} size={42} />
                <div className="social-user-meta">
                  <h3>{searchResult.displayName}</h3>
                  <span>@{searchResult.username}</span>
                </div>
              </div>
              <div className="social-user-actions">
                <button
                  type="button"
                  className="social-btn social-btn-primary"
                  onClick={() => handleAddFriend(searchResult.id)}
                >
                  <UserPlus size={14} /> Adicionar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Grupos */}
      {tab === "groups" && (
        <div className="social-tab-content">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <form
              onSubmit={handleJoinGroup}
              style={{ display: "flex", gap: 8, flex: 1, maxWidth: 360 }}
            >
              <input
                type="text"
                placeholder="Código de convite (ex: ABC123)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(108,88,76,0.25)",
                  flex: 1,
                }}
              />
              <button type="submit" className="social-btn">
                Entrar
              </button>
            </form>

            <button
              type="button"
              className="social-btn social-btn-primary"
              onClick={() => setShowCreateGroupModal(true)}
            >
              <PlusCircle size={16} /> Criar Grupo
            </button>
          </div>

          {groups.length === 0 ? (
            <div className="social-empty-state">
              <h3>Você ainda não participa de grupos de estudo</h3>
              <p>
                Crie um grupo privado para seus amigos ou entre utilizando um código de convite.
              </p>
            </div>
          ) : (
            <div className="social-card-list">
              {groups.map((g) => (
                <div key={g.id} className="social-user-card">
                  <div className="social-user-info">
                    <div className="social-user-meta">
                      <h3>{g.name}</h3>
                      {g.description && <span style={{ color: "#6c584c" }}>{g.description}</span>}
                      <span style={{ fontSize: 11, marginTop: 4 }}>
                        Código de convite: <strong>{g.inviteCode}</strong> (
                        <button
                          type="button"
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#2f4a3a",
                            cursor: "pointer",
                            padding: 0,
                          }}
                          onClick={() => {
                            void navigator.clipboard.writeText(g.inviteCode);
                            toast.success("Código copiado!");
                          }}
                        >
                          Copiar <Copy size={11} style={{ display: "inline" }} />
                        </button>
                        ) · Papel: {g.role === "admin" ? "Administrador" : "Membro"}
                      </span>
                    </div>
                  </div>
                  <StartCallButton groupId={g.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Ranking Semanal & Gamificação Social */}
      {tab === "ranking" && (
        <div className="social-tab-content">
          <div className="ranking-scope-selector">
            <div className="ranking-scope-buttons">
              <button
                type="button"
                className={`rooms-filter-btn ${rankingScope === "friends" ? "active" : ""}`}
                onClick={() => setRankingScope("friends")}
              >
                Entre Amigos
              </button>
              {groups.length > 0 && (
                <button
                  type="button"
                  className={`rooms-filter-btn ${rankingScope === "group" ? "active" : ""}`}
                  onClick={() => setRankingScope("group")}
                >
                  Por Grupo
                </button>
              )}
            </div>

            {rankingScope === "group" && groups.length > 0 && (
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(108,88,76,0.25)",
                  background: "#fffdfa",
                  fontSize: 13,
                  color: "#2f4a3a",
                }}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}

            <div className="ranking-privacy-select">
              <label htmlFor="vis-select">Sua visibilidade:</label>
              <select
                id="vis-select"
                value={rankingVisibility}
                onChange={(e) => void handleUpdateVisibility(e.target.value as RankingVisibility)}
              >
                <option value="public">Público (Nome e Foto)</option>
                <option value="anonymous">Anônimo (Estudante Anônimo)</option>
                <option value="hidden">Oculto (Não participar)</option>
              </select>
            </div>
          </div>

          <h3 style={{ fontSize: 16, color: "#2f4a3a", margin: "0 0 12px" }}>
            Quadro de Líderes · Foco Semanal
          </h3>

          {leaderboard.length === 0 ? (
            <div className="social-empty-state">
              <h3>Nenhum registro de foco esta semana</h3>
              <p>
                Participe de salas de estudo e conclua blocos de Pomodoro para acumular minutos.
              </p>
            </div>
          ) : (
            <div className="leaderboard-list">
              {leaderboard.map((entry) => {
                const rankClass =
                  entry.rankPosition === 1
                    ? "rank-1"
                    : entry.rankPosition === 2
                      ? "rank-2"
                      : entry.rankPosition === 3
                        ? "rank-3"
                        : "";
                const hours = Math.floor(entry.weeklyFocusMinutes / 60);
                const mins = entry.weeklyFocusMinutes % 60;
                const timeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;

                return (
                  <div
                    key={entry.userId}
                    className={`leaderboard-item ${entry.isCurrentUser ? "is-me" : ""}`}
                  >
                    <div className="leaderboard-left">
                      <div className={`leaderboard-rank-badge ${rankClass}`}>
                        {entry.rankPosition <= 3 ? (
                          <Medal size={16} />
                        ) : (
                          <span>{entry.rankPosition}º</span>
                        )}
                      </div>

                      <Avatar url={entry.avatarUrl} name={entry.displayName} size={38} />

                      <div className="leaderboard-user-details">
                        <span className="leaderboard-user-name">
                          {entry.displayName} {entry.isCurrentUser && "(Você)"}
                        </span>
                        <span className="leaderboard-user-tag">@{entry.username}</span>
                      </div>
                    </div>

                    <div className="leaderboard-stats">
                      <div className="leaderboard-focus-time">{timeStr}</div>
                      <div className="leaderboard-focus-label">tempo de foco</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Seção de Conquistas Sociais */}
          <h3 style={{ fontSize: 16, color: "#2f4a3a", margin: "28px 0 10px" }}>
            Conquistas Sociais
          </h3>
          <div className="achievements-grid">
            <div
              className={`achievement-card ${achievements.some((a) => a.achievementKey === "first_group_session") ? "unlocked" : "locked"}`}
            >
              <div className="achievement-icon-wrapper">
                <Users size={22} />
              </div>
              <div className="achievement-info">
                <h4>Primeiro Foco Coletivo</h4>
                <p>Concluiu seu primeiro bloco de foco em uma sala de estudos compartilhada.</p>
                {achievements.some((a) => a.achievementKey === "first_group_session") ? (
                  <span className="achievement-date">✓ Desbloqueada</span>
                ) : (
                  <span className="achievement-date">Bloqueada</span>
                )}
              </div>
            </div>

            <div className={`achievement-card ${friends.length >= 1 ? "unlocked" : "locked"}`}>
              <div className="achievement-icon-wrapper">
                <Award size={22} />
              </div>
              <div className="achievement-info">
                <h4>Amizade de Estudos</h4>
                <p>Conectou-se com seu primeiro amigo na plataforma GStudy.</p>
                {friends.length >= 1 ? (
                  <span className="achievement-date">✓ Desbloqueada</span>
                ) : (
                  <span className="achievement-date">Adicione 1 amigo para desbloquear</span>
                )}
              </div>
            </div>

            <div className={`achievement-card ${groups.length >= 1 ? "unlocked" : "locked"}`}>
              <div className="achievement-icon-wrapper">
                <Sparkles size={22} />
              </div>
              <div className="achievement-info">
                <h4>Círculo Acadêmico</h4>
                <p>Criou ou ingressou em um grupo de estudo privado.</p>
                {groups.length >= 1 ? (
                  <span className="achievement-date">✓ Desbloqueada</span>
                ) : (
                  <span className="achievement-date">Participe de 1 grupo</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bloqueio */}
      {blockModalTarget && (
        <div className="social-modal-overlay" onClick={() => setBlockModalTarget(null)}>
          <div className="social-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Bloquear Usuário</h2>
            <p>
              Tem certeza que deseja bloquear <strong>{blockModalTarget.name}</strong>? Vocês não
              poderão mais ver os perfis um do outro nem enviar mensagens ou convites.
            </p>
            <div className="social-modal-field">
              <label>Motivo do bloqueio (opcional):</label>
              <input
                type="text"
                placeholder="Ex: Não desejo contato"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
            </div>
            <div className="social-modal-actions">
              <button
                type="button"
                className="social-btn"
                onClick={() => setBlockModalTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="social-btn social-btn-danger"
                onClick={handleConfirmBlock}
              >
                Confirmar Bloqueio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Denúncia */}
      {reportModalTarget && (
        <div className="social-modal-overlay" onClick={() => setReportModalTarget(null)}>
          <div className="social-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Denunciar Usuário</h2>
            <p>
              Denunciando <strong>{reportModalTarget.name}</strong>. Sua denúncia é confidencial.
            </p>
            <div className="social-modal-field">
              <label>Motivo:</label>
              <select value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                <option value="Comportamento inadequado">Comportamento inadequado</option>
                <option value="Spam ou autopromoção">Spam ou autopromoção</option>
                <option value="Ofensas ou assédio">Ofensas ou assédio</option>
                <option value="Perfil falso ou invasão">Perfil falso ou invasão</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
            <div className="social-modal-field">
              <label>Detalhes adicionais:</label>
              <textarea
                rows={3}
                placeholder="Descreva brevemente o ocorrido..."
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
              />
            </div>
            <div className="social-modal-actions">
              <button
                type="button"
                className="social-btn"
                onClick={() => setReportModalTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="social-btn social-btn-danger"
                onClick={handleConfirmReport}
              >
                Enviar Denúncia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar Grupo */}
      {showCreateGroupModal && (
        <div className="social-modal-overlay" onClick={() => setShowCreateGroupModal(false)}>
          <div className="social-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Criar Grupo de Estudo</h2>
            <p>Grupos são privados por padrão e acessíveis através de código de convite único.</p>
            <form onSubmit={handleCreateGroup}>
              <div className="social-modal-field">
                <label>Nome do grupo:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Medicina 2027 · Turma A"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
              </div>
              <div className="social-modal-field">
                <label>Descrição (opcional):</label>
                <textarea
                  rows={2}
                  placeholder="Objetivos de estudo do grupo..."
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                />
              </div>
              <div className="social-modal-actions">
                <button
                  type="button"
                  className="social-btn"
                  onClick={() => setShowCreateGroupModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="social-btn social-btn-primary">
                  Criar Grupo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
