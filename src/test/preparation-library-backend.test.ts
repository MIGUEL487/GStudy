import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ research: vi.fn(), object: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/ai.server", () => ({ aiResearch: mocks.research, aiObject: mocks.object }));
vi.mock("@/lib/study-auth-middleware", () => ({ requireStudyAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (input: unknown): unknown => input;
    const builder = {
      middleware: () => builder,
      inputValidator: (validator: typeof parse) => {
        parse = validator;
        return builder;
      },
      handler:
        (fn: (input: unknown) => Promise<unknown>) =>
        async ({ data }: { data: unknown }) =>
          fn({ data: parse(data), context: { userId: "student" } }),
    };
    return builder;
  },
}));
import {
  curatePreparationLibrary,
  resolveLibrarySources,
  selectVideoClip,
} from "@/lib/preparation-library.functions";
import { bookLicenseEvidence, checkOfficialBook } from "@/lib/book-rights.server";
import {
  youtubeChapters,
  youtubeDuration,
  type VideoCandidate,
} from "@/lib/youtube-library.server";
import { libraryVideo } from "./helpers/library-fixture";

const page = "https://biblioteca.exemplo.edu.br/catalogo/matematica";
const title = "Matemática Básica Aberta";
const html = (rights = "https://creativecommons.org/licenses/by/4.0/") =>
  `<html><meta name="DC.title" content="${title}"><meta name="DC.creator" content="Equipe de Matemática"><meta name="DC.rights" content="${rights}"><meta name="citation_pdf_url" content="/livro.pdf"><a href="/livro.pdf">PDF</a></html>`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const data = {
  kind: "concurso",
  exam: "EsPCEx",
  edition: "2027",
  schoolYear: "medio-2",
  subject: "Matemática",
  focus: "Equações",
  topics: [
    { title: "Equações", goal: "Resolver equações" },
    { title: "Porcentagem", goal: "Aplicar porcentagem" },
  ],
  recommendations: [
    { kind: "book", title: "O Homem que Calculava", creator: "Malba Tahan", topicIndex: 1 },
  ],
};
const call = (input: unknown = data) =>
  (curatePreparationLibrary as unknown as (args: { data: unknown }) => Promise<any>)({
    data: input,
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("YOUTUBE_API_KEY", "youtube-private-key");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.research.mockResolvedValue({
    text: "Referências públicas de matemática para a prova.",
    sources: [
      { title: "Aula", url: "https://www.youtube.com/watch?v=abcdefghijk" },
      { title, url: page },
      {
        title: "O Homem que Calculava — Malba Tahan",
        url: "https://www.amazon.com.br/livros/dp/8501011665?tag=ignored",
      },
    ],
  });
  mocks.object.mockResolvedValue({
    videos: [
      {
        index: 0,
        topicIndex: 0,
        reason: "Use o capítulo de equações para revisar o assunto.",
        firstChapter: 1,
        lastChapter: 1,
      },
    ],
    books: [
      {
        title,
        author: "Equipe de Matemática",
        topicIndex: 0,
        reason: "Retome os fundamentos desta unidade.",
        sourceIndex: 1,
      },
      {
        title: "O Homem que Calculava",
        author: "Malba Tahan",
        topicIndex: 1,
        reason: "Pratique o raciocínio com desafios.",
        sourceIndex: 2,
      },
    ],
  });
  mocks.fetch.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/search"))
      return json({ items: [{ id: { videoId: "abcdefghijk" } }] });
    if (url.pathname.endsWith("/videos"))
      return json({
        items: [
          {
            id: "abcdefghijk",
            snippet: {
              title: libraryVideo.title,
              channelId: "UCabcdefghijklmnopqrstuv",
              channelTitle: "Universo Narrado",
              description: "00:00 Introdução\n1:00:00 Equações\n2:00:00 Porcentagem",
            },
            contentDetails: { duration: "PT12H" },
            status: { embeddable: true, privacyStatus: "public" },
          },
        ],
      });
    if (url.pathname.endsWith("/channels"))
      return json({
        items: [
          {
            id: "UCabcdefghijklmnopqrstuv",
            snippet: {
              title: "Universo Narrado",
              thumbnails: { medium: { url: libraryVideo.avatarUrl } },
            },
          },
        ],
      });
    if (url.pathname === "/oembed")
      return json({
        title: libraryVideo.title,
        author_name: "Universo Narrado",
        author_url: libraryVideo.channelUrl,
        provider_name: "YouTube",
        html: '<iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe>',
      });
    if (String(input) === page)
      return new Response(html(), { headers: { "content-type": "text/html" } });
    if (url.pathname === "/livro.pdf" && init?.method === "HEAD")
      return new Response(null, { headers: { "content-type": "application/pdf" } });
    throw new Error("Unexpected test URL");
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Curadoria oficial de aulas e livros", () => {
  it("busca vídeos reais, mantém logo/nome do canal e seleciona só capítulos publicados", async () => {
    const result = await call();
    expect(result.mode).toBe("youtube-api");
    expect(result.videos[0]).toMatchObject({
      id: "abcdefghijk",
      title: libraryVideo.title,
      channel: "Universo Narrado",
      avatarUrl: libraryVideo.avatarUrl,
      clip: { start: 3600, end: 7200, chapterTitle: "Equações" },
    });
    const search = mocks.fetch.mock.calls.filter(([url]) =>
      new URL(String(url)).pathname.endsWith("/search"),
    );
    expect(search).toHaveLength(2);
    expect(
      search.some(([url]) =>
        new URL(String(url)).searchParams.get("q")?.includes("Universo Narrado Militares"),
      ),
    ).toBe(true);
    for (const [url] of search)
      expect(new URL(String(url)).searchParams.get("key")).toBe("youtube-private-key");
    expect(JSON.stringify(mocks.object.mock.calls)).not.toContain("youtube-private-key");
    expect(result.books[0]).toMatchObject({
      access: "open",
      pdf: { license: "CC BY", url: "https://biblioteca.exemplo.edu.br/livro.pdf" },
    });
    expect(result.books[1].amazonUrl).toBe("https://www.amazon.com.br/dp/8501011665");
  });
  it("não pesquisa nomes de provas privadas, cadernos ou respostas pessoais", async () => {
    await call({ ...data, kind: "prova", exam: "Prova particular da professora Maria" });
    expect(JSON.stringify(mocks.research.mock.calls)).not.toContain("professora Maria");
    expect(JSON.stringify(mocks.fetch.mock.calls)).not.toContain("professora Maria");
  });
  it("sem chave YouTube, incorpora somente fontes confirmadas por oEmbed e não inventa capítulos", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "");
    const result = await call();
    expect(result.mode).toBe("sources");
    expect(result.videos[0].clip).toBeUndefined();
    expect(result.videos[0].chapters).toEqual([]);
    expect(result.videos[0].avatarUrl).toBeUndefined();
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes("googleapis.com"))).toBe(
      false,
    );
  });
  it("se a IA não puder classificar, preserva os vídeos verificados sem inventar trechos", async () => {
    mocks.object.mockRejectedValueOnce(new Error("Cota indisponível"));
    const result = await call();
    expect(result.videos[0].title).toBe(libraryVideo.title);
    expect(result.videos[0].clip).toBeUndefined();
    expect(result.books[0].access).toBe("paid");
  });
  it("mantém um vídeo não incorporável como link externo, sem contornar o bloqueio", async () => {
    const base = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (input, init) => {
      if (new URL(String(input)).pathname.endsWith("/videos")) {
        const payload = await (await base(input, init)).json();
        payload.items[0].status.embeddable = false;
        return json(payload);
      }
      return base(input, init);
    });
    expect((await call()).videos[0].embeddable).toBe(false);
  });
  it("não disponibiliza PDF comercialmente restrito mesmo estando em uma instituição pública", async () => {
    const base = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((input, init) =>
      String(input) === page
        ? new Response(html("https://creativecommons.org/licenses/by-nc/4.0/"), {
            headers: { "content-type": "text/html" },
          })
        : base(input, init),
    );
    const result = await call();
    expect(result.books[0]).toMatchObject({ access: "official", officialUrl: page });
    expect(result.books[0].pdf).toBeUndefined();
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).endsWith("/livro.pdf"))).toBe(false);
  });
  it("não expõe PDF sem extensão quando a suposta página do catálogo é um arquivo", async () => {
    const base = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((input, init) =>
      String(input) === page
        ? new Response("not a catalogue", { headers: { "content-type": "application/pdf" } })
        : base(input, init),
    );
    const book = (await call()).books[0];
    expect(book.pdf).toBeUndefined();
    expect(book.officialUrl).toBeUndefined();
  });
  it("resolve só redirecionamentos de grounding e não segue destinos privados", async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://www.youtube.com/watch?v=abcdefghijk" },
      }),
    );
    expect(
      await resolveLibrarySources([
        {
          title: "Aula",
          url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/example",
        },
      ]),
    ).toEqual([{ title: "Aula", url: "https://www.youtube.com/watch?v=abcdefghijk" }]);
    mocks.fetch.mockClear();
    mocks.fetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }),
    );
    expect(
      await resolveLibrarySources([
        {
          title: "Fonte",
          url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/example",
        },
      ]),
    ).toEqual([]);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("Licença do material, não apenas o rodapé do governo", () => {
  it.each(["by", "by-sa", "by-nd"])(
    "aceita licença comercial explícita %s do próprio livro",
    (license) => {
      expect(
        bookLicenseEvidence(
          html(`https://creativecommons.org/licenses/${license}/4.0/`),
          page,
          title,
        )?.url,
      ).toBe("https://biblioteca.exemplo.edu.br/livro.pdf");
    },
  );
  it.each(["by-nc", "by-nc-sa", "by-nc-nd"])(
    "recusa licença %s, mesmo com um rodapé CC BY",
    (license) => {
      expect(
        bookLicenseEvidence(
          html(`https://creativecommons.org/licenses/${license}/4.0/`) +
            "<footer>https://creativecommons.org/licenses/by/4.0/</footer>",
          page,
          title,
        ),
      ).toBeNull();
    },
  );
  it("não infere direitos de rodapé, título diferente, PDF externo ou arquivo ambíguo", () => {
    expect(
      bookLicenseEvidence(
        '<meta name="DC.title" content="Matemática Básica Aberta"><a href="/livro.pdf">PDF</a><footer>https://creativecommons.org/licenses/by/4.0/</footer>',
        page,
        title,
      ),
    ).toBeNull();
    expect(bookLicenseEvidence(html(), page, "Outro livro completamente diferente")).toBeNull();
    expect(
      bookLicenseEvidence(
        html().replaceAll("/livro.pdf", "https://drive.google.com/file/livro.pdf"),
        page,
        title,
      ),
    ).toBeNull();
    expect(bookLicenseEvidence(html() + '<a href="/outro.pdf">Outro</a>', page, title)).toBeNull();
  });
  it("aceita JSON-LD de um livro específico, mas não a licença genérica do site", () => {
    const metadata = {
      "@type": "Book",
      name: title,
      author: { "@type": "Organization", name: "Equipe de Matemática" },
      license: "https://creativecommons.org/licenses/by/4.0/",
      encoding: { contentUrl: "/livro.pdf" },
    };
    expect(
      bookLicenseEvidence(
        '<script type="application/ld+json">' + JSON.stringify(metadata) + "</script>",
        page,
        title,
      )?.license,
    ).toBe("CC BY");
    expect(
      bookLicenseEvidence(
        '<script type="application/ld+json">' +
          JSON.stringify({ ...metadata, "@type": "WebSite" }) +
          "</script>",
        page,
        title,
      ),
    ).toBeNull();
  });
  it("respeita uma fonte que autoriza a obra, mas bloqueia iframe", async () => {
    const base = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((input, init) =>
      String(input).endsWith("/livro.pdf")
        ? new Response(null, {
            headers: { "content-type": "application/pdf", "x-frame-options": "SAMEORIGIN" },
          })
        : base(input, init),
    );
    expect((await checkOfficialBook(page, title)).pdf?.embeddable).toBe(false);
  });
});

describe("Trechos de uma aula de doze horas", () => {
  it("lê tempos publicados, rejeita horários ausentes e mantém aula completa sem capítulos", () => {
    expect(youtubeDuration("PT12H")).toBe(43200);
    expect(
      youtubeChapters("00:00 Introdução\n01:00:00 Equações\n02:00:00 Porcentagem", 43200)[1],
    ).toEqual({ title: "Equações", start: 3600, end: 7200 });
    expect(youtubeChapters("Uma aula com doze horas de matemática", 43200)).toEqual([]);
    expect(youtubeChapters("00:00 Intro\n00:05 Outro\n00:03 Reverso", 43200)).toEqual([]);
    const candidate: VideoCandidate = { ...libraryVideo, description: "" };
    expect(selectVideoClip(candidate, 500, 501).clip).toBeUndefined();
    expect(selectVideoClip({ ...candidate, chapters: [] }, 0, 1).clip).toBeUndefined();
  });
});
