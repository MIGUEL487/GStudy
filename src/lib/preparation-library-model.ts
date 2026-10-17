import { z } from "zod";

const httpsUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        (!url.port || url.port === "443")
      );
    } catch {
      return false;
    }
  });
export function youtubeId(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const id =
      url.hostname === "youtu.be"
        ? url.pathname.slice(1)
        : ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname) &&
            url.pathname === "/watch"
          ? url.searchParams.get("v")
          : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export function youtubeChannel(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["www.youtube.com", "youtube.com"].includes(url.hostname) &&
      /^\/(?:channel\/UC[A-Za-z0-9_-]{22}|@[\p{L}\p{N}_.%-]+)\/?$/u.test(url.pathname)
      ? url.origin + url.pathname
      : null;
  } catch {
    return null;
  }
}
export const youtubeAvatar = (value: string) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["yt3.ggpht.com", "yt3.googleusercontent.com", "lh3.googleusercontent.com"].includes(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
};
// Brazilian public universities do not all use edu.br. Keep an explicit list;
// an arbitrary .org.br domain must never become a trusted PDF publisher.
const educationalPublishers = [
  "usp.br",
  "unicamp.br",
  "unesp.br",
  "ufrgs.br",
  "ufmg.br",
  "ufsc.br",
  "ufpr.br",
  "ufrj.br",
  "unb.br",
  "uerj.br",
  "impa.br",
  "obmep.org.br",
  "scielo.br",
  "openstax.org",
];
export const officialBookUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (/(?:^|\.)(?:gov|edu)\.br$/.test(url.hostname) ||
        educationalPublishers.some(
          (host) => url.hostname === host || url.hostname.endsWith("." + host),
        ))
    );
  } catch {
    return false;
  }
};
export function amazonProduct(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["amazon.com.br", "www.amazon.com.br"].includes(url.hostname)
    )
      return null;
    const id = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i.exec(url.pathname)?.[1];
    return id ? "https://www.amazon.com.br/dp/" + id.toUpperCase() : null;
  } catch {
    return null;
  }
}
export const amazonSearch = (title: string, author: string) =>
  "https://www.amazon.com.br/s?k=" + encodeURIComponent([title, author].filter(Boolean).join(" "));
const chapter = z
  .object({
    title: z.string().min(1).max(200),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .refine((chapter) => chapter.end > chapter.start);
export const libraryVideoSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    title: z.string().min(1).max(300),
    channel: z.string().min(1).max(180),
    channelUrl: httpsUrl.refine((value) => Boolean(youtubeChannel(value))),
    avatarUrl: httpsUrl.refine(youtubeAvatar).optional(),
    topicIndex: z.number().int().min(0).max(7),
    reason: z.string().min(1).max(1500),
    embeddable: z.boolean(),
    duration: z.number().int().positive().max(172800).optional(),
    chapters: z.array(chapter).max(200),
    clip: z
      .object({
        start: z.number().int().nonnegative(),
        end: z.number().int().positive(),
        chapterTitle: z.string().min(1).max(400),
      })
      .optional(),
  })
  .refine(
    (video) =>
      !video.clip ||
      (video.clip.end > video.clip.start &&
        (!video.duration || video.clip.end <= video.duration) &&
        video.chapters.some((c) => c.start === video.clip!.start) &&
        video.chapters.some((c) => c.end === video.clip!.end)),
  );
export const libraryBookSchema = z
  .object({
    title: z.string().min(1).max(250),
    author: z.string().max(200),
    topicIndex: z.number().int().min(0).max(7),
    reason: z.string().min(1).max(1500),
    access: z.enum(["open", "official", "paid"]),
    language: z.string().max(80).optional(),
    officialUrl: httpsUrl.refine(officialBookUrl).optional(),
    amazonUrl: httpsUrl.refine((value) => amazonProduct(value) === value).optional(),
    pdf: z
      .object({
        url: httpsUrl.refine(officialBookUrl),
        license: z.enum(["CC BY", "CC BY-SA", "CC BY-ND", "CC0", "Domínio público"]),
        attribution: z.string().trim().min(1).max(600),
        licenseUrl: httpsUrl.refine((value) => {
          const url = new URL(value);
          return (
            url.hostname === "creativecommons.org" &&
            /^\/(?:licenses\/(?:by|by-sa|by-nd)\/\d\.\d|publicdomain\/(?:zero|mark)\/1\.0)\/?$/.test(
              url.pathname,
            )
          );
        }),
        evidenceUrl: httpsUrl.refine(officialBookUrl),
        embeddable: z.boolean(),
        checkedAt: z.string().datetime(),
      })
      .optional(),
  })
  .refine((book) => (book.access === "open" ? Boolean(book.pdf && book.officialUrl) : !book.pdf));
export const preparationLibrarySchema = z.object({
  version: z.literal(1),
  checkedAt: z.string().datetime(),
  mode: z.enum(["youtube-api", "sources", "unavailable"]),
  videos: z.array(libraryVideoSchema).max(8),
  books: z.array(libraryBookSchema).max(12),
  videoNotice: z.string().max(500).optional(),
  bookNotice: z.string().max(500).optional(),
  bookSearchVersion: z.union([z.literal(2), z.literal(3)]).optional(),
  bookSearchStatus: z.enum(["verified", "catalogues", "no-results", "unavailable"]).optional(),
});
export type PreparationLibrary = z.infer<typeof preparationLibrarySchema>;
export type LibraryVideo = PreparationLibrary["videos"][number];
export type LibraryBook = PreparationLibrary["books"][number];
export function videoEmbedUrl(video: LibraryVideo, origin?: string) {
  const validated = libraryVideoSchema.safeParse(video);
  if (!validated.success || !video.embeddable) return null;
  const url = new URL("https://www.youtube-nocookie.com/embed/" + video.id);
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("controls", "1");
  url.searchParams.set("rel", "0");
  if (video.clip) {
    url.searchParams.set("start", String(video.clip.start));
    url.searchParams.set("end", String(video.clip.end));
  }
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (["https:", "http:"].includes(parsed.protocol))
        url.searchParams.set("origin", parsed.origin);
    } catch {}
  }
  return url.href;
}
export const videoWatchUrl = (video: LibraryVideo) =>
  `https://www.youtube.com/watch?v=${video.id}${video.clip ? "&t=" + video.clip.start + "s" : ""}`;
export function videoTime(seconds: number) {
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor(seconds / 60) % 60,
    rest = Math.floor(seconds) % 60;
  return (
    (hours ? hours + ":" + String(minutes).padStart(2, "0") : String(minutes)) +
    ":" +
    String(rest).padStart(2, "0")
  );
}
export function preferredChannels(subject: string, exam: string, focus: string) {
  const text = [subject, exam, focus]
    .join(" ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (!/matemat|fisica|raciocinio|militar|espcex|esa\b|afa\b|ita\b|ime\b|epcar|eear/.test(text))
    return [];
  return /militar|espcex|esa\b|afa\b|ita\b|ime\b|epcar|eear/.test(text)
    ? ["Universo Narrado Militares", "Universo Narrado", "Pedro Asaad"]
    : ["Universo Narrado", "Pedro Asaad"];
}

export const youtubeMissingNotice =
  "A busca de aulas ainda não está configurada neste site. O responsável precisa ativar a integração do YouTube na hospedagem.";

export function officialCatalogueSearches(query: string) {
  const term = encodeURIComponent(query.slice(0, 250));
  return [
    { name: "eduCAPES", url: "https://educapes.capes.gov.br/simple-search?query=" + term },
    { name: "SciELO Livros", url: "https://books.scielo.org/?s=" + term },
    {
      name: "Repositório do Ipea",
      url: "https://repositorio.ipea.gov.br/simple-search?query=" + term,
    },
  ];
}
