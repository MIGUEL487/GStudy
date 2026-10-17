import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchOpenStaxBooks, checkOpenStaxBook } from "@/lib/openstax-books.server";
import actualRecords from "./fixtures/openstax-real-records.json";
const fetchMock = vi.fn();
const source = "https://openstax.org/apps/cms/api/v2/pages/123/";
const work = {
  id: 123,
  title: "World History, Volume 2",
  meta: { type: "books.Book", slug: "world-history-volume-2", locale: "en" },
  book_state: "live",
  license_url: "https://creativecommons.org/licenses/by/4.0/",
  license_name: "Creative Commons Attribution License",
  license_text: null,
  authors: [{ type: "author", value: { name: "Autora do teste" } }],
  pdf_url: "https://assets.openstax.org/oscms-prodcms/media/documents/history.pdf",
};
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
function serve(item: Record<string, unknown> = work) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "openstax.org" && url.pathname === "/apps/cms/api/v2/pages/")
      return json({ meta: { total_count: 101 }, items: [item] });
    if (String(input) === source) return json(item);
    if (url.hostname === "openstax.org" && url.pathname.startsWith("/details/books/"))
      return new Response("<h1>Livro</h1>", { headers: { "content-type": "text/html" } });
    if (url.hostname === "assets.openstax.org")
      return new Response(null, { headers: { "content-type": "application/pdf" } });
    throw new Error("Unexpected URL");
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  serve();
});
afterEach(() => vi.unstubAllGlobals());
describe("Licença por obra da API educacional", () => {
  it("lê registros reais com meta.slug, mantém a edição CC BY exata e recusa a edição atual NC", async () => {
    const work = actualRecords.items[0]!;
    expect(Object.hasOwn(work, "slug")).toBe(false);
    const url = `https://openstax.org/apps/cms/api/v2/pages/${work.id}/`;
    fetchMock.mockImplementation(async (input) => {
      const target = new URL(String(input));
      if (target.pathname === "/apps/cms/api/v2/pages/")
        return json({ items: actualRecords.items });
      if (String(input) === url) return json(work);
      if (target.hostname === "assets.openstax.org")
        return new Response(null, { headers: { "content-type": "application/pdf" } });
      throw new Error(
        "A permissão da edição anterior não deve acompanhar o redirect da edição atual",
      );
    });
    expect((await searchOpenStaxBooks()).books).toEqual([
      { title: work.title, url, language: "en" },
    ]);
    expect(await checkOpenStaxBook(url, work.title)).toMatchObject({
      landing: true,
      url,
      editionStatus: "previous",
      pdf: { url: work.pdf_url, license: "CC BY", evidenceUrl: url },
    });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/details/books/"))).toBe(
      false,
    );
  });
  it("aceita títulos curtos e slugs com acento sem alterar os metadados oficiais", async () => {
    serve({ ...work, title: "Física", meta: { ...work.meta, slug: "física" } });
    expect((await searchOpenStaxBooks()).books[0]?.title).toBe("Física");
    expect((await checkOpenStaxBook(source, "Física")).pdf?.license).toBe("CC BY");
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("/details/books/f%C3%ADsica")),
    ).toBe(true);
  });
  it("encontra o livro sem pesquisa de IA, pagina sem duplicar e verifica a origem e a licença", async () => {
    expect(await searchOpenStaxBooks()).toEqual({
      available: true,
      books: [{ title: work.title, url: source, language: "en" }],
    });
    expect(
      fetchMock.mock.calls.some(
        ([url]) => new URL(String(url)).searchParams.get("offset") === "100",
      ),
    ).toBe(true);
    expect(await checkOpenStaxBook(source, work.title)).toMatchObject({
      landing: true,
      url: "https://openstax.org/details/books/world-history-volume-2",
      language: "en",
      pdf: {
        url: work.pdf_url,
        license: "CC BY",
        attribution: "Autora do teste",
        evidenceUrl: source,
        embeddable: true,
      },
    });
  });
  it.each([
    { ...work, license_url: "https://creativecommons.org/licenses/by-nc-sa/4.0/" },
    { ...work, license_text: "NonCommercial use only" },
    { ...work, book_state: "unlisted" },
    { ...work, authors: [] },
    { ...work, meta: { type: "pages.HomePage" } },
    { ...work, pdf_url: "https://drive.google.com/file/123" },
  ])("não libera obra restrita, retirada, sem créditos ou fora da origem oficial", async (item) => {
    serve(item);
    expect((await searchOpenStaxBooks()).books).toEqual([]);
    expect((await checkOpenStaxBook(source, work.title)).pdf).toBeNull();
  });
  it("recusa título diferente, domínio parecido e redirecionamento para IP privado", async () => {
    expect((await checkOpenStaxBook(source, "Outro livro totalmente diferente")).pdf).toBeNull();
    expect(
      (
        await checkOpenStaxBook(
          "https://openstax.org.evil.example/apps/cms/api/v2/pages/123/",
          work.title,
        )
      ).landing,
    ).toBe(false);
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } }),
    );
    expect((await checkOpenStaxBook(source, work.title)).landing).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("conserva o catálogo sem exibir PDF quando o download falha ou bloqueia iframe", async () => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) =>
      String(input).includes("assets.openstax.org")
        ? Promise.reject(new Error("offline"))
        : base(input, init),
    );
    expect(await checkOpenStaxBook(source, work.title)).toMatchObject({ landing: true, pdf: null });
    fetchMock.mockImplementation((input, init) =>
      String(input).includes("assets.openstax.org")
        ? new Response(null, {
            headers: { "content-type": "application/pdf", "x-frame-options": "SAMEORIGIN" },
          })
        : base(input, init),
    );
    expect((await checkOpenStaxBook(source, work.title)).pdf?.embeddable).toBe(false);
  });
  it("informa indisponibilidade sem inventar obras", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await searchOpenStaxBooks()).toEqual({ available: false, books: [] });
  });
});
