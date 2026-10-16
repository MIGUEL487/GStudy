import { officialBookUrl, type LibraryBook } from "./preparation-library-model";

const decode = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
const normalize = (value: string) =>
  decode(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const attributes = (tag: string) =>
  Object.fromEntries(
    [...tag.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs)].map((match) => [
      match[1]!.toLowerCase(),
      decode(match[3]!),
    ]),
  );
function license(value: string): NonNullable<LibraryBook["pdf"]> | null {
  // Only an explicit work-level machine-readable licence can authorize a PDF.
  // Generic government footers and "free download" notices are insufficient.
  if (
    /non.?commercial|nao.?comercial|não.?comercial|by-nc|todos os direitos reservados|all rights reserved/i.test(
      value,
    )
  )
    return null;
  const match =
    /https?:\/\/(?:www\.)?creativecommons\.org\/(licenses\/(by(?:-sa|-nd)?)\/(\d\.\d)|publicdomain\/(zero|mark)\/1\.0)/i.exec(
      value,
    );
  if (!match) return null;
  const label =
    match[4] === "zero"
      ? "CC0"
      : match[4] === "mark"
        ? "Domínio público"
        : match[2] === "by-sa"
          ? "CC BY-SA"
          : match[2] === "by-nd"
            ? "CC BY-ND"
            : "CC BY";
  return {
    attribution: "",
    url: "",
    evidenceUrl: "",
    license: label,
    licenseUrl: "https://creativecommons.org/" + match[1] + "/",
    embeddable: false,
    checkedAt: new Date().toISOString(),
  };
}
export function bookLicenseEvidence(
  html: string,
  pageUrl: string,
  title: string,
): NonNullable<LibraryBook["pdf"]> | null {
  if (!officialBookUrl(pageUrl)) return null;
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const content = (pattern: RegExp) =>
    metas
      .filter((meta) => pattern.test(meta["name"] || meta["property"] || ""))
      .map((meta) => meta["content"] || "");
  const matchingTitle = (actual: string) =>
    normalize(title).length >= 8 &&
    (normalize(actual).includes(normalize(title)) ||
      (normalize(title).includes(normalize(actual)) && normalize(actual).length >= 8));
  const pdfUrl = (value: string) => {
    try {
      const url = new URL(decode(value), pageUrl),
        page = new URL(pageUrl);
      return officialBookUrl(url.href) &&
        url.hostname === page.hostname &&
        /\.pdf$/i.test(url.pathname)
        ? url.href
        : null;
    } catch {
      return null;
    }
  };
  const workTitles = content(/^(?:dc\.title|dcterms\.title|citation_title)$/i);
  if (new Set(workTitles.map(normalize)).size === 1 && workTitles.some(matchingTitle)) {
    const rights = license(
      content(
        /^(?:dc\.rights(?:\.uri)?|dc\.rights\.license|dcterms\.license|dcterms\.rights)$/i,
      ).join(" "),
    );
    const authors = content(/^(?:dc\.creator(?:\.author)?|citation_author|dc\.publisher)$/i)
      .map((value) => value.trim())
      .filter(Boolean);
    if (rights && authors.length) {
      rights.attribution = [...new Set(authors)].join("; ").slice(0, 600);
      const candidates = [
        ...content(/^citation_pdf_url$/i),
        ...[...html.matchAll(/<a\b[^>]*>/gi)].map((match) => attributes(match[0])["href"] || ""),
      ]
        .map(pdfUrl)
        .filter((url): url is string => Boolean(url));
      const unique = [...new Set(candidates)];
      // Ambiguous editions/documents are not silently treated as the licensed book.
      if (unique.length === 1) return { ...rights, url: unique[0]!, evidenceUrl: pageUrl };
    }
  }
  for (const script of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed: unknown = JSON.parse(script[1]!);
      const objects = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of objects) {
        if (!item || typeof item !== "object") continue;
        const object = item as Record<string, unknown>;
        if (
          !["Book", "LearningResource", "CreativeWork"].includes(String(object["@type"])) ||
          !matchingTitle(String(object["name"] || ""))
        )
          continue;
        const rights = license(typeof object["license"] === "string" ? object["license"] : "");
        const media = object["encoding"] || object["associatedMedia"],
          entries = Array.isArray(media) ? media : [media];
        const urls = entries.flatMap((entry) =>
          entry && typeof entry === "object" && typeof entry.contentUrl === "string"
            ? [pdfUrl(entry.contentUrl)].filter((url): url is string => Boolean(url))
            : [],
        );
        const authorValue = object["author"] || object["creator"] || object["publisher"];
        const authors = (Array.isArray(authorValue) ? authorValue : [authorValue])
          .flatMap((value) =>
            typeof value === "string"
              ? [value]
              : value && typeof value === "object" && typeof value.name === "string"
                ? [value.name]
                : [],
          )
          .map((value) => decode(value).trim())
          .filter(Boolean);
        if (rights && authors.length && new Set(urls).size === 1)
          return {
            ...rights,
            attribution: [...new Set(authors)].join("; ").slice(0, 600),
            url: urls[0]!,
            evidenceUrl: pageUrl,
          };
      }
    } catch {
      /* Ignore malformed publisher metadata. No inferred permission. */
    }
  }
  return null;
}
export async function checkOfficialBook(
  pageUrl: string,
  title: string,
): Promise<{ landing: boolean; pdf: NonNullable<LibraryBook["pdf"]> | null }> {
  if (!officialBookUrl(pageUrl) || /\.pdf$/i.test(new URL(pageUrl).pathname))
    return { landing: false, pdf: null };
  try {
    const response = await fetch(pageUrl, { signal: AbortSignal.timeout(6000), redirect: "error" });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("text/html") ||
      Number(response.headers.get("content-length")) > 1_500_000
    )
      return { landing: false, pdf: null };
    const html = await response.text();
    if (html.length > 1_500_000) return { landing: false, pdf: null };
    const evidence = bookLicenseEvidence(html, pageUrl, title);
    if (!evidence) return { landing: true, pdf: null };
    const pdf = await fetch(evidence.url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!pdf.ok || !pdf.headers.get("content-type")?.toLowerCase().includes("application/pdf"))
      return { landing: true, pdf: null };
    const xfo = pdf.headers.get("x-frame-options"),
      csp = pdf.headers.get("content-security-policy");
    return {
      landing: true,
      pdf: { ...evidence, embeddable: !xfo && !/frame-ancestors/i.test(csp || "") },
    };
  } catch {
    return { landing: false, pdf: null };
  }
}
