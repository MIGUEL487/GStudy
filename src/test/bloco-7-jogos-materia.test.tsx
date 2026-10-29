import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { GAMES_CATALOG, getGamesBySubject, getGameById } from "@/lib/games/catalog";
import {
  calculateGameStars,
  calculateGameXp,
  saveGameHighScore,
  getStoredHighScores,
  HIGHSCORES_STORAGE_KEY,
} from "@/lib/games/types";
import { GameCatalog } from "@/components/games/game-catalog";
import { GamePlayer } from "@/components/games/game-player";
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    params?: { gameId?: string };
  }) => (
    <a href={to.replace("$gameId", params?.gameId ?? "")} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/games.functions", () => ({
  generateGame: vi.fn(),
  readSharedGame: vi.fn(),
  explainGameMistake: vi.fn(),
}));
afterEach(cleanup);

describe("Bloco 7: Catálogo de Jogos por Matéria e Motor GameDefinition", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("7.1 Catálogo e Definições de Jogos", () => {
    it("possui pelo menos 9 jogos cobrindo Matemática, Geografia e Português", () => {
      expect(GAMES_CATALOG.length).toBeGreaterThanOrEqual(9);

      const subjects = new Set(GAMES_CATALOG.map((g) => g.subject));
      expect(subjects.has("matematica")).toBe(true);
      expect(subjects.has("geografia")).toBe(true);
      expect(subjects.has("portugues")).toBe(true);
    });

    it("contém os jogos obrigatórios de Matemática com tipos corretos", () => {
      const calcMental = getGameById("math-calc-mental");
      expect(calcMental).toBeDefined();
      expect(calcMental?.type).toBe("time-survival");

      const tabuada = getGameById("math-tabuada");
      expect(tabuada).toBeDefined();
      expect(tabuada?.type).toBe("time-survival");

      const balanca = getGameById("math-balanca");
      expect(balanca).toBeDefined();
      expect(balanca?.type).toBe("multiple-choice");
    });

    it("contém os jogos obrigatórios de Geografia incluindo Mapa-múndi interativo", () => {
      const mapa = getGameById("geo-mapa-mundi");
      expect(mapa).toBeDefined();
      expect(mapa?.type).toBe("map-click");

      const capitais = getGameById("geo-capitais");
      expect(capitais).toBeDefined();

      const bandeiras = getGameById("geo-bandeiras");
      expect(bandeiras).toBeDefined();
    });

    it("contém os jogos obrigatórios de Português", () => {
      const ortografia = getGameById("port-certo-errado");
      expect(ortografia).toBeDefined();

      const acentuacao = getGameById("port-acentuacao");
      expect(acentuacao).toBeDefined();

      const crase = getGameById("port-crase");
      expect(crase).toBeDefined();
    });

    it("cada jogo possui 3 níveis de dificuldade (facil, medio, dificil) e regras claras", () => {
      for (const game of GAMES_CATALOG) {
        expect(game.rules.length).toBeGreaterThan(10);
        expect(game.questions.facil.length).toBeGreaterThanOrEqual(3);
        expect(game.questions.medio.length).toBeGreaterThanOrEqual(3);
        expect(game.questions.dificil.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("7.2 Sistema de Pontuação, Combo, Estrelas e XP", () => {
    it("preserva o armazenamento global antigo sem atribuí-lo a outra conta", () => {
      const raw = JSON.stringify({ antigo: { bestScore: 900 } });
      localStorage.setItem(HIGHSCORES_STORAGE_KEY, raw);
      expect(getStoredHighScores("account-a")).toEqual({});
      expect(getStoredHighScores()).toEqual({});
      expect(localStorage.getItem(HIGHSCORES_STORAGE_KEY)).toBe(raw);
    });
    it("calcula estrelas corretamente: 3 estrelas para >= 85%, 2 para >= 60%, 1 caso contrário", () => {
      expect(calculateGameStars(9, 10)).toBe(3); // 90%
      expect(calculateGameStars(8, 10)).toBe(2); // 80%
      expect(calculateGameStars(6, 10)).toBe(2); // 60%
      expect(calculateGameStars(5, 10)).toBe(1); // 50%
      expect(calculateGameStars(0, 10)).toBe(1); // 0%
    });

    it("calcula XP concedido proporcionalmente à pontuação e estrelas", () => {
      const xp3Stars = calculateGameXp(1000, 3);
      const xp1Star = calculateGameXp(200, 1);

      expect(xp3Stars).toBeGreaterThan(xp1Star);
      expect(xp3Stars).toBeGreaterThanOrEqual(25);
    });

    it("persiste recordes no localStorage e detecta novos recordes", () => {
      const res1 = {
        gameId: "math-calc-mental",
        difficulty: "medio" as const,
        score: 500,
        hits: 5,
        mistakes: 1,
        maxCombo: 3,
        stars: 2,
        xpEarned: 20,
        isNewRecord: false,
      };

      const isNew1 = saveGameHighScore(res1, "account-a");
      expect(isNew1).toBe(true);

      const stored = getStoredHighScores("account-a");
      expect(getStoredHighScores("account-b")).toEqual({});
      expect(stored["math-calc-mental_medio"]?.bestScore).toBe(500);

      // Score menor não supera recorde
      const res2 = { ...res1, score: 400 };
      const isNew2 = saveGameHighScore(res2, "account-a");
      expect(isNew2).toBe(false);

      // Score maior supera recorde
      const res3 = { ...res1, score: 750, stars: 3 };
      const isNew3 = saveGameHighScore(res3, "account-a");
      expect(isNew3).toBe(true);
      expect(getStoredHighScores("account-a")["math-calc-mental_medio"]?.bestScore).toBe(750);
    });
  });

  describe("7.3 Interface do Catálogo de Jogos", () => {
    it("renderiza catálogo com filtros por matéria", () => {
      render(<GameCatalog />);

      expect(screen.getByRole("tab", { name: /Todas as matérias/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Matemática/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Geografia/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Português/i })).toBeInTheDocument();

      expect(screen.getByText("Relâmpago de Cálculo Mental")).toBeInTheDocument();
      expect(screen.getByText("Quiz de Capitais")).toBeInTheDocument();
      expect(screen.getByText("Desafio da Crase")).toBeInTheDocument();
    });

    it("filtra a grade ao clicar em uma matéria específica", () => {
      render(<GameCatalog />);

      fireEvent.click(screen.getByRole("tab", { name: /Geografia/i }));

      expect(screen.getByText("Mapa-múndi Interativo")).toBeInTheDocument();
      expect(screen.getByText("Quiz de Capitais")).toBeInTheDocument();
      expect(screen.queryByText("Relâmpago de Cálculo Mental")).not.toBeInTheDocument();
    });

    it("abre cada jogo em uma página própria", () => {
      render(<GameCatalog />);

      const playBtn = screen.getByLabelText(/Jogar solo: Relâmpago de Cálculo Mental/i);
      expect(playBtn).toHaveAttribute("href", "/jogos/math-calc-mental");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("7.4 Motor de Execução GamePlayer", () => {
    it("inicia o jogo após tela de regras e exibe pontuação e combo", () => {
      const game = getGameById("math-balanca")!;
      render(<GamePlayer game={game} onClose={vi.fn()} />);

      // Na tela de regras
      expect(screen.getByRole("heading", { name: "Balança de Equações" })).toBeInTheDocument();

      // Clica em começar
      fireEvent.click(screen.getByRole("button", { name: /Começar desafio/i }));

      // Na partida ativa
      expect(screen.getByText(/COMBO x1/i)).toBeInTheDocument();
      expect(screen.getByText(/0 pts/i)).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });
  });
});
