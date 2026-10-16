import {
  youtubeAvatar,
  youtubeChannel,
  youtubeId,
  type LibraryVideo,
} from "./preparation-library-model";

type Chapter = LibraryVideo["chapters"][number];
export type VideoCandidate = LibraryVideo & { description: string };
export class YouTubeUnavailable extends Error {
  constructor(public code: "setup" | "quota" | "unavailable") {
    super("A busca de aulas não está disponível agora.");
  }
}
const jsonObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const text = (value: unknown, max = 300) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const items = (value: unknown) =>
  Array.isArray(jsonObject(value)["items"]) ? (jsonObject(value)["items"] as unknown[]) : [];
export const youtubeDuration = (value: string) => {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return undefined;
  const seconds = Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
  return seconds > 0 && seconds <= 172800 ? seconds : undefined;
};
export function youtubeChapters(description: string, duration: number | undefined): Chapter[] {
  if (!duration) return [];
  const markers: { title: string; start: number }[] = [];
  for (const line of description.split(/\r?\n/)) {
    const match =
      /^\s*(?:[•\-–]\s*)?(?:(.+?)\s+[-–—]\s*)?(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:[-–—|]\s*)?(.*?)\s*$/.exec(
        line,
      );
    if (!match) continue;
    const parts = match[2]!.split(":").map(Number);
    if (parts.slice(1).some((value) => value >= 60)) continue;
    const start = parts.reduce((result, value) => result * 60 + value, 0),
      title = (match[3] || match[1] || "").trim().slice(0, 200);
    if (!title || start >= duration || start < 0) continue;
    markers.push({ title, start });
  }
  // Only use published, ordered chapter boundaries. Never invent an AI timestamp.
  if (
    markers.length < 3 ||
    markers.length > 200 ||
    markers[0]!.start !== 0 ||
    markers.some((marker, index) => index > 0 && marker.start - markers[index - 1]!.start < 10)
  )
    return [];
  return markers
    .map((marker, index) => ({ ...marker, end: markers[index + 1]?.start ?? duration }))
    .filter((chapter) => chapter.end - chapter.start >= 10);
}
async function api(
  path: "search" | "videos" | "channels",
  params: Record<string, string>,
  key: string,
) {
  const url = new URL("https://www.googleapis.com/youtube/v3/" + path);
  for (const [name, value] of Object.entries({ ...params, key })) url.searchParams.set(name, value);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(6500), redirect: "error" });
  } catch {
    throw new YouTubeUnavailable("unavailable");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = jsonObject(jsonObject(payload)["error"]),
      errors = error["errors"];
    const quota =
      Array.isArray(errors) &&
      errors.some((item) => /quota|rateLimit|dailyLimit/i.test(String(jsonObject(item)["reason"])));
    throw new YouTubeUnavailable(
      quota || response.status === 429
        ? "quota"
        : [400, 401, 403].includes(response.status)
          ? "setup"
          : "unavailable",
    );
  }
  return payload;
}
export async function searchYouTube(queries: string[], key: string) {
  const found = await Promise.all(
    queries
      .slice(0, 3)
      .map((query) =>
        api(
          "search",
          {
            part: "snippet",
            type: "video",
            videoEmbeddable: "true",
            safeSearch: "moderate",
            relevanceLanguage: "pt",
            maxResults: "4",
            q: query.slice(0, 400),
          },
          key,
        ),
      ),
  );
  return [
    ...new Set(
      found.flatMap((result) =>
        items(result)
          .map(
            (item) => text(jsonObject(jsonObject(item)["id"])["videoId"]).match(/^[\w-]{11}$/)?.[0],
          )
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  ].slice(0, 12);
}
export async function youtubeVideos(ids: string[], key: string): Promise<VideoCandidate[]> {
  const distinct = [...new Set(ids.filter((id) => /^[\w-]{11}$/.test(id)))].slice(0, 12);
  if (!distinct.length) return [];
  const result = await api(
    "videos",
    { part: "snippet,contentDetails,status", id: distinct.join(",") },
    key,
  );
  const rows = items(result).map(jsonObject),
    channelIds = [
      ...new Set(
        rows
          .map((row) => text(jsonObject(row["snippet"])["channelId"]))
          .filter((id) => /^UC[\w-]{22}$/.test(id)),
      ),
    ];
  const channelRows = channelIds.length
    ? items(await api("channels", { part: "snippet", id: channelIds.join(",") }, key)).map(
        jsonObject,
      )
    : [];
  return rows.flatMap((row) => {
    const id = text(row["id"]),
      snippet = jsonObject(row["snippet"]),
      details = jsonObject(row["contentDetails"]),
      status = jsonObject(row["status"]),
      channelId = text(snippet["channelId"]);
    if (
      !/^[\w-]{11}$/.test(id) ||
      !/^UC[\w-]{22}$/.test(channelId) ||
      status["privacyStatus"] !== "public"
    )
      return [];
    const info = jsonObject(
        channelRows.find((channel) => channel["id"] === channelId)?.["snippet"],
      ),
      thumbnails = jsonObject(info["thumbnails"]);
    const avatar = text(jsonObject(thumbnails["medium"] || thumbnails["default"])["url"], 2000),
      channel = text(info["title"] || snippet["channelTitle"], 180),
      title = text(snippet["title"]);
    if (!title || !channel) return [];
    const description = text(snippet["description"], 6000),
      duration = youtubeDuration(text(details["duration"]));
    return [
      {
        id,
        title,
        channel,
        channelUrl: "https://www.youtube.com/channel/" + channelId,
        ...(youtubeAvatar(avatar) ? { avatarUrl: avatar } : {}),
        topicIndex: 0,
        reason: "Aula encontrada para este conteúdo.",
        embeddable:
          status["embeddable"] === true &&
          jsonObject(details["contentRating"])["ytRating"] !== "ytAgeRestricted",
        ...(duration ? { duration } : {}),
        description,
        chapters: youtubeChapters(description, duration),
      },
    ];
  });
}
export async function youtubeFromSources(urls: string[]): Promise<VideoCandidate[]> {
  const ids = [...new Set(urls.map(youtubeId).filter((id): id is string => Boolean(id)))].slice(
    0,
    8,
  );
  const result = await Promise.allSettled(
    ids.map(async (id) => {
      const endpoint = new URL("https://www.youtube.com/oembed");
      endpoint.searchParams.set("url", "https://www.youtube.com/watch?v=" + id);
      endpoint.searchParams.set("format", "json");
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(6000),
        redirect: "error",
      });
      if (!response.ok) return null;
      const payload = jsonObject(await response.json()),
        channelUrl = youtubeChannel(text(payload["author_url"], 2000)),
        title = text(payload["title"]),
        channel = text(payload["author_name"], 180);
      // oEmbed confirms the provider permits an official embed; its HTML is never rendered.
      if (
        !channelUrl ||
        !title ||
        !channel ||
        payload["provider_name"] !== "YouTube" ||
        typeof payload["html"] !== "string" ||
        !String(payload["html"]).includes("/embed/" + id)
      )
        return null;
      return {
        id,
        title,
        channel,
        channelUrl,
        topicIndex: 0,
        reason: "Aula encontrada nas fontes pesquisadas.",
        embeddable: true,
        description: "",
        chapters: [],
      } satisfies VideoCandidate;
    }),
  );
  return result.flatMap((item) => (item.status === "fulfilled" && item.value ? [item.value] : []));
}
