import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireStudyAuth } from "./study-auth-middleware";
import {
  arraySchema,
  cleanLearningText,
  learningLanguage,
  objectSchema,
  stringSchema,
} from "./learning-ai";
import { preparationDetailsSchema, sourceUrl } from "./preparation-model";
import {
  amazonProduct,
  officialBookUrl,
  preferredChannels,
  preparationLibrarySchema,
  youtubeId,
  youtubeMissingNotice,
  type LibraryBook,
  type LibraryVideo,
} from "./preparation-library-model";
import { searchOpenStaxBooks, checkOpenStaxBook, openStaxApi } from "./openstax-books.server";
import { checkOfficialBook, searchOfficialBooks } from "./book-rights.server";
import {
  searchYouTube,
  youtubeFromSources,
  youtubeVideos,
  YouTubeUnavailable,
  type VideoCandidate,
} from "./youtube-library.server";

const input = preparationDetailsSchema.extend({
  scope: z.enum(["all", "books"]).default("all"),
  topics: z
    .array(z.object({ title: z.string().trim().min(1).max(200), goal: z.string().max(1000) }))
    .min(1)
    .max(8),
  recommendations: z
    .array(
      z.object({
        title: z.string().max(250),
        creator: z.string().max(180),
        kind: z.enum(["video", "book"]),
        topicIndex: z.number().int().min(0).max(7),
      }),
    )
    .max(8),
});
type PublicSource = { title: string; url: string };
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function relevantOpenStaxBooks(
  books: { title: string; url: string; language?: string }[],
  context: string,
) {
  const topic = normalize(context),
    terms = topic.split(" ").filter((word) => word.length > 3);
  for (const [pattern, english] of [
    [
      /geopolit|geografia|relacoes internacionais|ordem mundial/,
      ["politic", "world history", "econom", "sociolog"],
    ],
    [/historia|civiliza/, ["history"]],
    [/politic|socio|sociais/, ["politic", "sociolog"]],
    [/matemat|equac|fraco|porcent|aritmet|axioma/, ["algebra", "precalculus", "math"]],
    [/biolog|ecolog/, ["biology"]],
    [/fisica|mecanic/, ["physics"]],
    [/quimic/, ["chemistry"]],
    [/econom/, ["economic"]],
  ] as [RegExp, string[]][])
    if (pattern.test(topic)) terms.push(...english);
  return books
    .map((book) => ({
      book,
      score: terms.filter((term) => normalize(book.title).includes(term)).length,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => item.book);
}
const supportedSource = (value: string) =>
  Boolean(youtubeId(value) || amazonProduct(value) || officialBookUrl(value));
export async function resolveLibrarySources(sources: PublicSource[]) {
  const settled = await Promise.allSettled(
    sources.slice(0, 16).map(async (source) => {
      if (!sourceUrl.safeParse(source.url).success || new URL(source.url).port) return null;
      let url = new URL(source.url);
      for (
        let hop = 0;
        hop < 3 &&
        url.hostname === "vertexaisearch.cloud.google.com" &&
        url.pathname.startsWith("/grounding-api-redirect/");
        hop++
      ) {
        let response = await fetch(url, {
          method: "HEAD",
          redirect: "manual",
          signal: AbortSignal.timeout(4500),
        });
        if ([200, 405, 501].includes(response.status) && !response.headers.get("location")) {
          await response.body?.cancel();
          response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(4500) });
        }
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (![301, 302, 303, 307, 308].includes(response.status) || !location) return null;
        const next = new URL(location, url);
        if (!sourceUrl.safeParse(next.href).success || next.port) return null;
        url = next;
      }
      return supportedSource(url.href)
        ? { title: cleanLearningText(source.title).slice(0, 300), url: url.href }
        : null;
    }),
  );
  const seen = new Set<string>();
  return settled.flatMap((item) => {
    const source = item.status === "fulfilled" ? item.value : null;
    if (!source || seen.has(source.url)) return [];
    seen.add(source.url);
    return [source];
  });
}
const selection = z.object({
  videos: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        topicIndex: z.number().int().min(0).max(7),
        reason: z.string().trim().min(1).max(1500),
        firstChapter: z.number().int().nonnegative().nullable(),
        lastChapter: z.number().int().nonnegative().nullable(),
      }),
    )
    .max(8),
  books: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(250),
        author: z.string().trim().max(200),
        topicIndex: z.number().int().min(0).max(7),
        reason: z.string().trim().min(1).max(1500),
        sourceIndex: z.number().int().nonnegative().nullable(),
      }),
    )
    .max(10),
});
const nullableIndex = { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] };
export function selectVideoClip(
  candidate: VideoCandidate,
  first: number | null,
  last: number | null,
): LibraryVideo {
  const { description: _description, clip: _clip, ...video } = candidate;
  if (
    first === null ||
    last === null ||
    first > last ||
    !candidate.chapters[first] ||
    !candidate.chapters[last]
  )
    return video;
  const start = candidate.chapters[first]!.start,
    end = candidate.chapters[last]!.end;
  if (!candidate.duration || end > candidate.duration || end <= start) return video;
  return {
    ...video,
    clip: {
      start,
      end,
      chapterTitle:
        candidate.chapters[first]!.title +
        (first !== last ? " → " + candidate.chapters[last]!.title : ""),
    },
  };
}
export const getPreparationYouTubeStatus = createServerFn({ method: "GET" })
  .middleware([requireStudyAuth])
  .handler(() => ({ youtubeConfigured: Boolean(process.env["YOUTUBE_API_KEY"]?.trim()) }));

export const curatePreparationLibrary = createServerFn({ method: "POST" })
  .middleware([requireStudyAuth])
  .inputValidator((value: unknown) => input.parse(value))
  .handler(async ({ data }) => {
    const { aiResearch, aiObject } = await import("./ai.server");
    const key = data.scope === "books" ? undefined : process.env["YOUTUBE_API_KEY"]?.trim();
    const preferred = preferredChannels(
      data.subject,
      data.kind === "prova" ? "" : data.exam,
      data.focus,
    );
    const publicContext = {
      subject: data.subject,
      focus: data.focus,
      schoolYear: data.schoolYear,
      ...(data.kind !== "prova" ? { exam: data.exam, edition: data.edition } : {}),
      topics: data.topics.map((topic) => topic.title),
      preferredChannels: preferred,
    };
    const queries = data.topics
      .slice(0, 3)
      .map((topic, index) =>
        [
          topic.title,
          data.subject,
          preferred[index % Math.max(1, preferred.length)] || "aula em português",
        ].join(" "),
      );
    // Only public topics are searched: no notebooks, private exam names, answers or PDFs.
    const [researchResult, searchResult, catalogueResult] = await Promise.allSettled([
      aiResearch(
        [
          learningLanguage,
          "Faça uma pesquisa web dedicada a LIVROS e materiais didáticos públicos para estes tópicos e etapa escolar. As videoaulas são buscadas separadamente: não gaste as fontes da pesquisa com vídeos. Priorize obras relevantes de órgãos públicos e instituições de ensino brasileiras com licença comercial explícita CC BY, CC BY-SA, CC BY-ND, CC0 ou domínio público. Pesquise nos catálogos educapes.capes.gov.br, repositorio.ufsc.br e outras editoras e repositórios de universidades públicas (inclusive usp.br, unesp.br, ufmg.br, ufrgs.br), além de portais gov.br e edu.br. Use termos do assunto junto de licença Creative Commons CC BY; não indique uma obra só por ser gratuita. Retorne preferencialmente 3 a 6 páginas de catálogo de OBRAS ESPECÍFICAS com título, autoria e metadados de direitos; não páginas iniciais, listas genéricas nem PDFs soltos. Uma publicação no governo não concede licença comercial por si só. Inclua complementarmente páginas de produto de livros comerciais na Amazon Brasil. Não use pastas particulares, cópias piratas, apostilas vazadas ou livros pagos disponibilizados sem permissão. Não invente URLs, direitos nem que leu o livro. Retorne recomendações descritivas e fontes reais da busca; sem busca, deixe a limitação clara.",
        ].join("\n"),
        [{ role: "user", content: JSON.stringify(publicContext) }],
      ),
      key ? searchYouTube(queries, key) : Promise.resolve([]),
      searchOpenStaxBooks(),
    ]);
    const research =
      researchResult.status === "fulfilled"
        ? researchResult.value
        : {
            text: "Pesquisa indisponível. Use somente os metadados públicos verificados e recomendações como busca.",
            sources: [],
          };
    const sources = await resolveLibrarySources(research.sources);
    if (!sources.some((source) => officialBookUrl(source.url))) {
      const catalogueResults = await searchOfficialBooks(
        data.topics.slice(0, 2).map((topic) => topic.title),
      );
      sources.push(...catalogueResults);
    }
    if (catalogueResult.status === "fulfilled") {
      const extra = relevantOpenStaxBooks(
        catalogueResult.value.books,
        [data.subject, data.focus, ...data.topics.map((topic) => topic.title)].join(" "),
      );
      sources.push(...extra.filter((book) => !sources.some((source) => source.url === book.url)));
    }
    const catalogueAvailable =
      sources.some((source) => officialBookUrl(source.url)) ||
      (catalogueResult.status === "fulfilled" && catalogueResult.value.available);
    let candidates: VideoCandidate[] = [],
      mode: "youtube-api" | "sources" | "unavailable" = "unavailable";
    let videoNotice: string | undefined;
    try {
      if (key && searchResult.status === "fulfilled") {
        candidates = await youtubeVideos(
          [
            ...searchResult.value,
            ...sources
              .map((source) => youtubeId(source.url))
              .filter((id): id is string => Boolean(id)),
          ],
          key,
        );
        mode = "youtube-api";
      } else if (searchResult.status === "rejected") throw searchResult.reason;
    } catch (cause) {
      const code = cause instanceof YouTubeUnavailable ? cause.code : "unavailable";
      videoNotice =
        code === "quota"
          ? "A busca de aulas atingiu a cota disponível do YouTube. Aguarde a renovação da cota; as aulas já salvas continuam acessíveis."
          : code === "disabled"
            ? "A API do YouTube não está habilitada no projeto Google desta chave. O responsável precisa ativar YouTube Data API v3 no mesmo projeto da chave."
            : code === "restricted"
              ? "As restrições da chave bloquearam a chamada do servidor. O responsável precisa permitir YouTube Data API v3 e conferir as restrições de aplicativo da chave."
              : code === "setup"
                ? "O YouTube recusou a configuração da integração. O responsável precisa conferir YOUTUBE_API_KEY em Production e publicar novamente."
                : "Não foi possível conectar à busca de aulas do YouTube agora. Tente atualizar as indicações em instantes.";
      console.error("[GStudy YouTube] Falha na busca:", {
        category: code,
        status: cause instanceof YouTubeUnavailable ? (cause.status ?? null) : null,
      });
    }
    if (!candidates.length && data.scope !== "books") {
      candidates = await youtubeFromSources(sources.map((source) => source.url));
      if (candidates.length) mode = "sources";
    }
    if (!key && mode !== "sources") videoNotice = youtubeMissingNotice;
    const topicIndexFor = (text: string) => {
      const content = normalize(text);
      const ranked = data.topics
        .map((topic, index) => ({
          index,
          score: normalize(topic.title)
            .split(" ")
            .filter((word) => word.length > 3 && content.includes(word)).length,
        }))
        .sort((a, b) => b.score - a.score);
      return ranked[0]!.index;
    };
    const ranked = [...candidates].sort(
      (a, b) =>
        Number(preferred.some((name) => normalize(b.channel).includes(normalize(name)))) -
        Number(preferred.some((name) => normalize(a.channel).includes(normalize(name)))),
    );
    let chosen: z.infer<typeof selection> = {
      videos: ranked.slice(0, Math.min(8, data.topics.length + 1)).map((candidate) => ({
        index: candidates.indexOf(candidate),
        topicIndex: topicIndexFor([candidate.title, candidate.description].join(" ")),
        reason: "Aula encontrada para este conteúdo. Registre as ideias e pratique no caderno.",
        firstChapter: null,
        lastChapter: null,
      })),
      books: [
        ...sources
          .flatMap((source, sourceIndex) =>
            officialBookUrl(source.url)
              ? [
                  {
                    title: source.title.slice(0, 250),
                    author: "",
                    topicIndex: topicIndexFor(source.title),
                    reason:
                      "Referência encontrada no catálogo oficial. Consulte o índice e relacione a leitura ao seu tópico de estudo.",
                    sourceIndex,
                  },
                ]
              : [],
          )
          .slice(0, 6),
        ...data.recommendations
          .filter((resource) => resource.kind === "book")
          .map((resource) => ({
            title: resource.title,
            author: resource.creator,
            topicIndex: Math.min(resource.topicIndex, data.topics.length - 1),
            reason: "Referência sugerida para complementar o estudo. Confira a edição na Amazon.",
            sourceIndex: null,
          })),
      ].slice(0, 10),
    };
    try {
      const generated = await aiObject(
        [
          learningLanguage,
          "Faça uma curadoria pedagógica a partir SOMENTE dos vídeos verificados e das fontes recebidas. Priorize relevância e adequação à etapa escolar; dê preferência aos canais indicados, incluindo Universo Narrado Militares para provas militares e Universo Narrado/Pedro Asaad em matemática/física. Não chame esta seleção de um ranking objetivo de todos os vídeos do YouTube. Não invente títulos, autores, canais, logos, vídeo IDs ou links.",
          "Selecione até oito vídeos pelo index, com topicIndex e reason específica. Para um vídeo longo, escolha firstChapter e lastChapter (inclusivo) SOMENTE entre os capítulos publicados nos metadados, com seus índices. Se não houver capítulos, ou não der para localizar o assunto com confiança, ambos devem ser null e o player abre a aula completa. Nunca estime um horário pelo tamanho do vídeo. Uma aula de 12 horas não é uma sessão de estudo de 12 horas. Não afirme ter assistido ao conteúdo.",
          "Indique livros reais relevantes, priorizando referências gratuitas oficiais em português. OpenStax é uma editora educacional complementar: preserve o título original e não invente que a edição é em português; avise no reason se o material for de outro idioma. Quando houver catálogos institucionais relevantes nas fontes, inclua essas obras na seleção; não substitua toda a biblioteca pública por livros comerciais. Copie o título completo da obra, pois a licença será conferida com esse título. sourceIndex aponta para a fonte fornecida, ou null se não houver fonte correspondente. Não infira permissão comercial, não gere URLs de PDF, não use Drive particular. O aplicativo verificará a licença do próprio livro na fonte oficial antes de disponibilizar um PDF; o selo gov.br não basta. Inclua também uma seleção complementar de livros pagos disponíveis para procurar na Amazon Brasil, sem inventar preço, ISBN, ASIN ou gratuidade. Não invente que leu um livro só por ver o catálogo.",
        ].join("\n"),
        [
          {
            role: "user",
            content: JSON.stringify({
              ...publicContext,
              candidates: candidates.map(({ description: _description, ...candidate }, index) => ({
                ...candidate,
                index,
              })),
              sources,
              research: research.text,
              suggestions: data.recommendations.filter((resource) => resource.kind === "book"),
            }),
          },
        ],
        objectSchema({
          videos: arraySchema(
            objectSchema({
              index: { type: "integer", minimum: 0 },
              topicIndex: { type: "integer", minimum: 0, maximum: data.topics.length - 1 },
              reason: stringSchema,
              firstChapter: nullableIndex,
              lastChapter: nullableIndex,
            }),
            0,
            8,
          ),
          books: arraySchema(
            objectSchema({
              title: stringSchema,
              author: stringSchema,
              topicIndex: { type: "integer", minimum: 0, maximum: data.topics.length - 1 },
              reason: stringSchema,
              sourceIndex: nullableIndex,
            }),
            0,
            10,
          ),
        }),
      );
      const parsed = selection.safeParse(generated);
      if (parsed.success) chosen = parsed.data;
    } catch {
      /* Keep verified metadata and clearly marked searches if the AI cannot rank them. */
    }
    const videoIds = new Set<string>();
    const videos = chosen.videos.flatMap((item) => {
      const candidate = candidates[item.index];
      if (!candidate || item.topicIndex >= data.topics.length || videoIds.has(candidate.id))
        return [];
      videoIds.add(candidate.id);
      return [
        {
          ...selectVideoClip(candidate, item.firstChapter, item.lastChapter),
          topicIndex: item.topicIndex,
          reason: cleanLearningText(item.reason),
        },
      ];
    });
    if (!videos.length && !videoNotice)
      videoNotice = candidates.length
        ? "A seleção não encontrou uma aula adequada entre os resultados. Tente atualizar as indicações ou confira as sugestões de busca."
        : "A busca do YouTube não encontrou aulas para estes termos. Tente atualizar as indicações ou ajustar o foco do plano.";
    const bookTitles = new Set<string>();
    const uniqueBooks = chosen.books.filter((item) => {
      if (item.topicIndex >= data.topics.length || bookTitles.has(normalize(item.title)))
        return false;
      bookTitles.add(normalize(item.title));
      return true;
    });
    const books: LibraryBook[] = await Promise.all(
      uniqueBooks.map(async (item) => {
        const source = item.sourceIndex === null ? undefined : sources[item.sourceIndex];
        const base = {
          title: cleanLearningText(item.title),
          author: cleanLearningText(item.author),
          reason: cleanLearningText(item.reason),
          topicIndex: item.topicIndex,
        };
        if (source && officialBookUrl(source.url)) {
          const checked: {
            landing: boolean;
            url?: string;
            language?: string;
            editionStatus?: "current" | "previous";
            pdf: LibraryBook["pdf"] | null;
          } = openStaxApi(source.url)
            ? await checkOpenStaxBook(source.url, item.title)
            : await checkOfficialBook(source.url, item.title);
          return {
            ...base,
            ...(checked.landing ? { officialUrl: checked.url || source.url } : {}),
            ...(checked.language ? { language: checked.language } : {}),
            ...(checked.editionStatus ? { editionStatus: checked.editionStatus } : {}),
            access: checked.pdf ? ("open" as const) : ("official" as const),
            ...(checked.pdf
              ? { pdf: checked.pdf, author: checked.pdf.attribution.slice(0, 200) }
              : {}),
          };
        }
        const product =
          source && normalize(source.title).includes(normalize(item.title))
            ? amazonProduct(source.url)
            : null;
        return { ...base, access: "paid" as const, ...(product ? { amazonUrl: product } : {}) };
      }),
    );
    // A text-only fallback can omit every public source while ranking books.
    // Keep up to two relevant, independently verified publisher records instead
    // of turning an available open catalogue into an empty paid-only selection.
    if (!books.some((book) => book.access === "open")) {
      const additional = sources
        .filter(
          (source) =>
            openStaxApi(source.url) &&
            !uniqueBooks.some(
              (item) => item.sourceIndex !== null && sources[item.sourceIndex]?.url === source.url,
            ),
        )
        .slice(0, 2);
      const verified = await Promise.all(
        additional.map(async (source) => {
          const checked = await checkOpenStaxBook(source.url, source.title);
          return checked.pdf && checked.url
            ? {
                title: source.title,
                author: checked.pdf.attribution.slice(0, 200),
                topicIndex: topicIndexFor(source.title),
                reason:
                  "Leitura complementar da editora educacional. Confira o índice e o idioma da edição para selecionar os capítulos pertinentes ao seu conteúdo.",
                access: "open" as const,
                officialUrl: checked.url,
                pdf: checked.pdf,
                ...(checked.language ? { language: checked.language } : {}),
                ...(checked.editionStatus ? { editionStatus: checked.editionStatus } : {}),
              }
            : null;
        }),
      );
      for (const book of verified)
        if (book && !books.some((item) => normalize(item.title) === normalize(book.title)))
          books.push(book);
    }
    return preparationLibrarySchema.parse({
      version: 1,
      checkedAt: new Date().toISOString(),
      mode,
      videos,
      books,
      bookSearchVersion: 4,
      bookSearchStatus: books.some((book) => book.access === "open")
        ? "verified"
        : books.some((book) => book.officialUrl)
          ? "catalogues"
          : catalogueAvailable
            ? "no-results"
            : "unavailable",
      ...(videoNotice ? { videoNotice } : {}),
      ...(!books.some((book) => book.access === "open")
        ? {
            bookNotice: !catalogueAvailable
              ? "Não foi possível confirmar uma consulta completa aos acervos agora. Isso não significa que não existam livros para este assunto. Explore as buscas nos catálogos abaixo ou tente novamente; seus vídeos serão mantidos."
              : !sources.some((source) => officialBookUrl(source.url))
                ? "A pesquisa não retornou catálogos públicos verificáveis para este assunto. Tente buscar livros novamente; os vídeos já escolhidos serão mantidos."
                : books.some((book) => book.access === "official" && book.officialUrl)
                  ? "Os catálogos encontrados ainda não permitiram confirmar um PDF com licença comercial explícita. Consulte as referências oficiais abaixo ou tente buscar livros novamente."
                  : "Ainda não foi possível confirmar uma referência pública acessível para este assunto. Tente buscar livros novamente; as aulas salvas serão mantidas.",
          }
        : {}),
    });
  });
