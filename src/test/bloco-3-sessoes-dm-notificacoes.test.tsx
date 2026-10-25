import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  fetchDirectMessages,
  sendDirectMessage,
  markDirectMessagesAsRead,
} from "@/lib/direct-messages-model";
import {
  fetchNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/lib/notifications-model";
import { SessionsView } from "@/components/sessions-view";
import { NotificationsPopover } from "@/components/notifications-popover";
import { FriendsDrawer } from "@/components/friends-drawer";
import { DirectMessagesModal } from "@/components/direct-messages-modal";
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/games.functions", () => ({
  generateGame: vi.fn(),
  readSharedGame: vi.fn(),
  explainGameMistake: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    [key: string]: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/sessoes" }),
}));

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => {
  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "direct_messages") {
      return {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "dm-1",
                    sender_id: "user-1",
                    recipient_id: "user-2",
                    content: "Olá! Vamos estudar hoje?",
                    read_at: null,
                    created_at: new Date().toISOString(),
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "dm-2",
                sender_id: "user-1",
                recipient_id: "user-2",
                content: "Estou resolvendo a lista de Física.",
                read_at: null,
                created_at: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      };
    }

    if (table === "notifications") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "notif-1",
                    user_id: "user-1",
                    sender_id: "user-2",
                    type: "friend_request",
                    title: "Novo pedido de amizade",
                    body: "Mariana Silva (@mariana) enviou um pedido de amizade.",
                    data: { friendship_id: "f-123", username: "mariana" },
                    read: false,
                    created_at: new Date().toISOString(),
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      };
    }

    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
  });

  return {
    supabase: {
      from: mockFrom,
      rpc: vi.fn().mockImplementation((name: string) =>
        Promise.resolve({
          data:
            name === "get_social_inbox"
              ? { pending: 1, unread: { "user-2": 2 } }
              : { success: true },
          error: null,
        }),
      ),
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      }),
      removeChannel: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "aluno@gstudy.com" } },
          error: null,
        }),
      },
    },
  };
});

// Mock social-model functions
vi.mock("@/lib/social-model", () => ({
  isSocialFeatureEnabled: () => true,
  sanitizePlainText: (t: string) => t.replace(/<[^>]*>/g, ""),
  listFriends: vi.fn().mockResolvedValue([
    {
      id: "f-1",
      userId: "user-1",
      friendId: "user-2",
      status: "accepted",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profile: {
        id: "user-2",
        username: "mariana",
        displayName: "Mariana Silva",
        status: "studying",
      },
    },
  ]),
  listPendingRequests: vi.fn().mockResolvedValue({
    incoming: [
      {
        id: "f-incoming-1",
        userId: "user-3",
        friendId: "user-1",
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        profile: {
          id: "user-3",
          username: "pedro",
          displayName: "Pedro Lima",
          status: "online",
        },
      },
    ],
    outgoing: [],
  }),
  sendFriendRequest: vi.fn().mockResolvedValue(undefined),
  acceptFriendRequest: vi.fn().mockResolvedValue(undefined),
  removeFriendship: vi.fn().mockResolvedValue(undefined),
  searchUserExact: vi.fn().mockResolvedValue({
    id: "user-4",
    username: "lucas_dev",
    displayName: "Lucas Dev",
  }),
  listMyGroups: vi.fn().mockResolvedValue([]),
}));

// Mock sub-views
vi.mock("@/components/study-rooms-view", () => ({
  StudyRoomsView: () => <div data-testid="mock-rooms-view">Salas de Estudo ao Vivo</div>,
}));

vi.mock("@/components/social-friends-panel", () => ({
  SocialFriendsPanel: ({ initialTab }: { initialTab?: string }) => (
    <div data-testid="mock-groups-panel">Painel Social: {initialTab}</div>
  ),
}));

describe("Bloco 3: Sessões, DMs, Notificações e Amigos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Modelo de Mensagens Diretas (DMs)", () => {
    it("busca mensagens diretas entre dois usuários", async () => {
      const messages = await fetchDirectMessages("user-1", "user-2");
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe("Olá! Vamos estudar hoje?");
      expect(messages[0].senderId).toBe("user-1");
    });

    it("envia mensagem direta sanitizada com sucesso", async () => {
      const msg = await sendDirectMessage(
        "user-1",
        "user-2",
        "Estou resolvendo a lista de Física.",
      );
      expect(msg).not.toBeNull();
      expect(msg?.content).toBe("Estou resolvendo a lista de Física.");
    });

    it("rejeita mensagens vazias ou com mais de 1000 caracteres", async () => {
      const empty = await sendDirectMessage("user-1", "user-2", "   ");
      expect(empty).toBeNull();

      const tooLong = await sendDirectMessage("user-1", "user-2", "a".repeat(1001));
      expect(tooLong).toBeNull();
    });
  });

  describe("Modelo de Notificações", () => {
    it("busca notificações pendentes do usuário", async () => {
      const notifs = await fetchNotifications("user-1");
      expect(notifs.length).toBe(1);
      expect(notifs[0].type).toBe("friend_request");
      expect(notifs[0].title).toBe("Novo pedido de amizade");
      expect(notifs[0].read).toBe(false);
    });
  });

  describe("Componente SessionsView (Segmentação)", () => {
    it("renderiza os três modos segmentados e alterna entre Salas, Grupos e Jogos", async () => {
      render(<SessionsView initialTab="rooms" />);

      expect(screen.getByTestId("mock-rooms-view")).toBeInTheDocument();

      // Alterna para Grupos
      const groupsBtn = screen.getByRole("tab", { name: /Grupos/i });
      fireEvent.click(groupsBtn);
      expect(await screen.findByTestId("mock-groups-panel")).toBeInTheDocument();

      // Alterna para Jogos
      const gamesBtn = screen.getByRole("tab", { name: /Jogos/i });
      fireEvent.click(gamesBtn);
      expect(
        await screen.findByRole("tablist", { name: "Filtrar jogos por matéria" }),
      ).toBeInTheDocument();
    });
  });

  describe("Componente NotificationsPopover", () => {
    it("exibe o sino com contador e lista a notificação de pedido", async () => {
      render(<NotificationsPopover userId="user-1" />);

      const bellBtn = screen.getByRole("button", { name: /Abrir notificações/i });
      fireEvent.click(bellBtn);

      await waitFor(() => {
        expect(screen.getByText("Novo pedido de amizade")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Aceitar/i })).toBeInTheDocument();
      });
    });
  });

  describe("Componente FriendsDrawer e Adicionar Amigo", () => {
    it("abre a gaveta, lista amigos e permite buscar e adicionar um colega", async () => {
      render(<FriendsDrawer userId="user-1" />);

      // Abre gaveta
      const triggerBtn = screen.getByRole("button", { name: /Abrir amigos de estudo/i });
      fireEvent.click(triggerBtn);

      await waitFor(() => {
        expect(screen.getByText("Amigos de Estudo")).toBeInTheDocument();
        expect(screen.getByText("Mariana Silva")).toBeInTheDocument();
      });

      // Alterna para aba Adicionar
      const addTab = screen.getByRole("tab", { name: /\+ Adicionar/i });
      fireEvent.click(addTab);

      // Preenche busca
      const input = screen.getByPlaceholderText(/Ex: @mariana ou email exato/i);
      fireEvent.change(input, { target: { value: "lucas_dev" } });

      const searchSubmit = screen.getByRole("button", { name: /Buscar usuário/i });
      fireEvent.click(searchSubmit);

      await waitFor(() => {
        expect(screen.getByText("Lucas Dev")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Adicionar Amigo/i })).toBeInTheDocument();
      });

      // Clica em Adicionar Amigo
      fireEvent.click(screen.getByRole("button", { name: /Adicionar Amigo/i }));

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /Pedidos/ })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });
    });
  });

  describe("Componente DirectMessagesModal (Chat 1:1)", () => {
    it("renderiza a conversa com o amigo e permite enviar mensagem", async () => {
      const onClose = vi.fn();
      render(
        <DirectMessagesModal
          currentUserId="user-1"
          friend={{
            id: "user-2",
            username: "mariana",
            displayName: "Mariana Silva",
            status: "studying",
          }}
          onClose={onClose}
        />,
      );

      expect(screen.getByText("Mariana Silva")).toBeInTheDocument();
      expect(screen.getByText(/@mariana/i)).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText("Olá! Vamos estudar hoje?")).toBeInTheDocument();
      });

      // Digita nova mensagem
      const input = screen.getByPlaceholderText(/Mensagem para Mariana Silva/i);
      fireEvent.change(input, { target: { value: "Com certeza, vamos!" } });

      const sendBtn = screen.getByRole("button", { name: /Enviar mensagem/i });
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(input).toHaveValue("");
      });
    });
  });
});
