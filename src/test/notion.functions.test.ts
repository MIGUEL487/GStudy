import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  databaseFailure: vi.fn(),
}));

vi.mock("@/lib/study-auth-middleware", () => ({ requireStudyAuth: {} }));
vi.mock("@/lib/notion.server", () => ({
  databaseFailure: mocks.databaseFailure,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (input: unknown) => unknown = (input) => input;
    const builder = {
      middleware: () => builder,
      validator: (validator: (input: unknown) => unknown) => {
        parse = validator;
        return builder;
      },
      inputValidator: (validator: (input: unknown) => unknown) => {
        parse = validator;
        return builder;
      },
      handler:
        (handler: (input: unknown) => Promise<unknown>) =>
        async ({ data }: { data: unknown }) =>
          handler({
            data: parse(data),
            context: {
              supabase: { from: mocks.from },
              userId: "11111111-1111-4111-8111-111111111111",
            },
          }),
    };
    return builder;
  },
}));

import { getNotionImports, notionStatus } from "@/lib/notion.functions";

describe("Notion server functions", () => {
  const userId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chama notionStatus e retorna status da conexão", async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { workspace_name: "Meu Workspace", last_synced_at: "2026-10-19T20:00:00Z" },
      error: null,
    });

    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    });

    const call = <T, R>(fn: (args: { data: T }) => Promise<R>, data: T) => fn({ data });
    const result = await call(notionStatus, { userId });

    expect(result).toEqual({
      connected: true,
      workspace: "Meu Workspace",
      lastSynced: "2026-10-19T20:00:00Z",
    });
  });

  it("chama getNotionImports e pagina ordenando por imported_at desc", async () => {
    const mockRange = vi.fn().mockResolvedValue({
      data: [
        {
          page_id: "page-1",
          title: "Anotações de História",
          source_url: "https://notion.so/p1",
          content: "Conteúdo importante",
          subject: "História",
          date_events: [],
          last_edited_at: "2026-10-19T19:00:00Z",
          imported_at: "2026-10-19T20:00:00Z",
        },
      ],
      error: null,
    });

    const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

    mocks.from.mockReturnValue({ select: mockSelect });

    const call = <T, R>(fn: (args: { data: T }) => Promise<R>, data: T) => fn({ data });
    const result = await call(getNotionImports, { userId, offset: 0 });

    expect(mockOrder).toHaveBeenCalledWith("imported_at", { ascending: false });
    expect(mockRange).toHaveBeenCalledWith(0, 4);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].id).toBe("page-1");
    expect(result.pages[0].title).toBe("Anotações de História");
    expect(result.hasMore).toBe(false);
  });
});
