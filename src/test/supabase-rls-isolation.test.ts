import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("2. Banco de dados & RLS: Isolamento entre Usuário A e Usuário B", () => {
  const migrationsDir = path.resolve(__dirname, "../../drizzle/migrations");

  it("verifica se todas as tabelas criadas nas migrações possuem RLS ativada (ENABLE ROW LEVEL SECURITY)", () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    const allSql = files
      .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8"))
      .join("\n");

    const tableMatches = [
      ...allSql.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z_0-9]+)/gi),
    ].map((m) => m[1]);

    for (const table of tableMatches) {
      const rlsPattern = new RegExp(
        `ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`,
        "i",
      );
      expect(allSql).toMatch(rlsPattern);
    }
  });

  it("garante que todas as funções SECURITY DEFINER fixam search_path = ''", () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    const allSql = files
      .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8"))
      .join("\n");

    const functionBlocks = allSql.split(/CREATE OR REPLACE FUNCTION/i).slice(1);
    for (const block of functionBlocks) {
      if (/SECURITY DEFINER/i.test(block)) {
        expect(block).toMatch(/SET search_path\s*=\s*''/i);
      }
    }
  });

  it("garante que as políticas de SELECT, INSERT, UPDATE, DELETE exigem auth.uid() = user_id", () => {
    const cacheSql = fs.readFileSync(
      path.join(migrationsDir, "0005_ai_activity_cache.sql"),
      "utf8",
    );
    const quotaSql = fs.readFileSync(path.join(migrationsDir, "0004_server_ai_quotas.sql"), "utf8");

    // Cache:
    expect(cacheSql).toContain('CREATE POLICY "read own ai cache" ON public.ai_activity_cache');
    expect(cacheSql).toContain("USING (auth.uid() = user_id)");
    expect(cacheSql).toContain('CREATE POLICY "insert own ai cache" ON public.ai_activity_cache');
    expect(cacheSql).toContain("WITH CHECK (auth.uid() = user_id)");
    expect(cacheSql).toContain('CREATE POLICY "update own ai cache" ON public.ai_activity_cache');
    expect(cacheSql).toContain('CREATE POLICY "delete own ai cache" ON public.ai_activity_cache');

    // Quota:
    expect(quotaSql).toContain('CREATE POLICY "read own ai usage" ON public.user_daily_ai_usage');
    expect(quotaSql).toContain("USING (auth.uid() = user_id)");
  });

  it("simula validação de RLS: Usuário A não consegue ler nem alterar dados do Usuário B", () => {
    // Simulação determinística do comportamento de RLS do Postgres
    type Row = { id: string; user_id: string; data: string };
    const database: Row[] = [
      { id: "row-1", user_id: "user-A", data: "Dados de A" },
      { id: "row-2", user_id: "user-B", data: "Dados de B" },
    ];

    function selectWithRls(currentUserId: string): Row[] {
      // Simula: WHERE auth.uid() = user_id
      return database.filter((row) => row.user_id === currentUserId);
    }

    function updateWithRls(currentUserId: string, rowId: string, newData: string): boolean {
      const row = database.find((r) => r.id === rowId && r.user_id === currentUserId);
      if (!row) return false;
      row.data = newData;
      return true;
    }

    // Usuário A consulta o banco:
    const rowsForA = selectWithRls("user-A");
    expect(rowsForA).toHaveLength(1);
    expect(rowsForA[0].data).toBe("Dados de A");
    expect(rowsForA.find((r) => r.user_id === "user-B")).toBeUndefined();

    // Usuário A tenta alterar o registro do Usuário B:
    const updateResult = updateWithRls("user-A", "row-2", "Tentativa de injeção");
    expect(updateResult).toBe(false);

    // Dados do Usuário B continuam intactos:
    const rowsForB = selectWithRls("user-B");
    expect(rowsForB[0].data).toBe("Dados de B");
  });
});
