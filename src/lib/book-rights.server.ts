import { officialBookUrl, type LibraryBook } from "./preparation-library-model";

const decode = (value: string) =>
  value
    .replace(
      /&(aacute|eacute|iacute|oacute|uacute|acirc|ecirc|ocirc|atilde|otilde|ccedil);/gi,
      (entity, name: string) => {
        const letters: Record<string, string> = {
          aacute: "á",
          eacute: "é",
          iacute: "í",
          oacute: "ó",
          uacute: "ú",
          acirc: "â",
          ecirc: "ê",
          ocirc: "ô",
          atilde: "ã",
          otilde: "õ",
          ccedil: "ç",
        };
        const letter = letters[name.toLowerCase()]!;
        return name[0] === name[0]?.toUpperCase() ? letter.toUpperCase() : letter;
      },
    )
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, code: string) => {
      const point = code[0]?.toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    })
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
const restrictedRights = (value: string) =>
  /non.?commercial|nao.?comercial|by[\s-]*nc|todos os direitos reservados|all rights reserved/i.test(
    normalize(value),
  );
export function bookLicense(value: string): NonNullable<LibraryBook["pdf"]> | null {
  // Only explicit work-level rights can authorize a PDF.
  // Generic government footers and "free download" notices are insufficient.
  if (restrictedRights(value)) return null;
  const uri =
    /https?:\/\/(?:www\.)?creativecommons\.org\/(licenses\/(by(?:-sa|-nd)?)\/(\d\.\d)|publicdomain\/(zero|mark)\/1\.0)/i.exec(
      value,
    );
  // DSpace repositories also publish rights as a versioned CC label in dc.rights.
  // Never apply this parser to the entire HTML or to a site's footer.
  const labelMatch = /\bCC\s+BY(?:[\s-]+(SA|ND))?\s+(1\.0|2\.0|2\.5|3\.0|4\.0)\b/i.exec(value);
  const match =
    uri ||
    (labelMatch
      ? [
          "",
          `licenses/by${labelMatch[1] ? "-" + labelMatch[1].toLowerCase() : ""}/${labelMatch[2]}`,
          `by${labelMatch[1] ? "-" + labelMatch[1].toLowerCase() : ""}`,
        ]
      : null);
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
  const pdfUrl = (value: string, explicit = false) => {
    try {
      const url = new URL(decode(value), pageUrl),
        page = new URL(pageUrl);
      return officialBookUrl(url.href) &&
        (explicit || (url.hostname === page.hostname && /\.pdf$/i.test(url.pathname)))
        ? url.href
        : null;
    } catch {
      return null;
    }
  };
  const workTitles = content(/^(?:dc\.title|dcterms\.title|citation_title)$/i);
  if (new Set(workTitles.map(normalize)).size === 1 && workTitles.some(matchingTitle)) {
    const workRights = content(
      /^(?:dc\.rights(?:\.uri)?|dc\.rights\.license|dcterms\.license|dcterms\.rights)$/i,
    ).join(" ");
    if (restrictedRights(workRights)) return null;
    const rights = bookLicense(workRights);
    const authors = content(/^(?:dc\.creator(?:\.author)?|citation_author|dc\.publisher)$/i)
      .map((value) => value.trim())
      .filter(Boolean);
    if (rights && authors.length) {
      rights.attribution = [...new Set(authors)].join("; ");
      if (rights.attribution.length > 600) return null;
      const declared = content(/^citation_pdf_url$/i);
      const candidates = (
        declared.length
          ? declared.map((value) => pdfUrl(value, true))
          : [...html.matchAll(/<a\b[^>]*>/gi)].map((match) =>
              pdfUrl(attributes(match[0])["href"] || ""),
            )
      ).filter((url): url is string => Boolean(url));
      if (declared.length && candidates.length !== declared.length) return null;
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
      const roots = Array.isArray(parsed) ? parsed : [parsed];
      const objects = roots.flatMap((root) =>
        root && typeof root === "object" && Array.isArray(root["@graph"]) ? root["@graph"] : [root],
      );
      for (const item of objects) {
        if (!item || typeof item !== "object") continue;
        const object = item as Record<string, unknown>;
        if (
          !(Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]]).some((type) =>
            ["Book", "LearningResource", "CreativeWork"].includes(String(type)),
          ) ||
          !matchingTitle(String(object["name"] || ""))
        )
          continue;
        const licenseValue = object["license"];
        const rights = bookLicense(
          typeof licenseValue === "string"
            ? licenseValue
            : licenseValue && typeof licenseValue === "object"
              ? String(
                  (licenseValue as Record<string, unknown>)["@id"] ||
                    (licenseValue as Record<string, unknown>)["url"] ||
                    "",
                )
              : "",
        );
        const media = object["encoding"] || object["associatedMedia"],
          entries = Array.isArray(media) ? media : [media];
        const urls = entries.flatMap((entry) =>
          entry && typeof entry === "object" && typeof entry.contentUrl === "string"
            ? [pdfUrl(entry.contentUrl, true)].filter((url): url is string => Boolean(url))
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
        if (
          rights &&
          authors.length &&
          [...new Set(authors)].join("; ").length <= 600 &&
          new Set(urls).size === 1
        )
          return {
            ...rights,
            attribution: [...new Set(authors)].join("; "),
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
export async function officialFetch(value: string, init: RequestInit = {}) {
  let url = new URL(value);
  const signal = AbortSignal.timeout(6000);
  for (let hop = 0; hop < 4; hop++) {
    if (!officialBookUrl(url.href)) throw new Error("Unsupported book source");
    const response = await fetch(url.href, { ...init, signal, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, url: url.href };
    const location = response.headers.get("location");
    if (!location) throw new Error("Invalid catalogue redirect");
    await response.body?.cancel();
    url = new URL(location, url);
  }
  throw new Error("Too many catalogue redirects");
}
// A public catalogue remains searchable when the model's web grounding is
// unavailable. These are real search results, not model-generated book URLs.
export async function searchOfficialBooks(queries: string[]) {
  const results = await Promise.allSettled(
    queries.slice(0, 2).map(async (query) => {
      const url = new URL("https://educapes.capes.gov.br/simple-search");
      url.searchParams.set("query", query);
      const { response, url: finalUrl } = await officialFetch(url.href);
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("text/html") ||
        Number(response.headers.get("content-length")) > 1_500_000
      ) {
        await response.body?.cancel();
        return [];
      }
      const html = await response.text();
      if (html.length > 1_500_000) return [];
      const books: { title: string; url: string }[] = [];
      for (const anchor of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
        const href = attributes(anchor[1]!)["href"];
        if (!href) continue;
        let item;
        try {
          item = new URL(href, finalUrl);
        } catch {
          continue;
        }
        const title = decode(anchor[2]!.replace(/<[^>]*>/g, " "))
          .replace(/\s+/g, " ")
          .trim();
        if (
          !officialBookUrl(item.href) ||
          item.hostname !== "educapes.capes.gov.br" ||
          !/^\/handle\/capes\/[a-z0-9-]+\/?$/i.test(item.pathname) ||
          title.length < 8
        )
          continue;
        books.push({ title: title.slice(0, 250), url: item.origin + item.pathname });
        if (books.length === 4) break;
      }
      return books;
    }),
  );
  const seen = new Set<string>();
  return results
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((book) => {
      if (seen.has(book.url)) return false;
      seen.add(book.url);
      return true;
    })
    .slice(0, 6);
}
export async function checkOfficialBook(
  pageUrl: string,
  title: string,
): Promise<{
  landing: boolean;
  url?: string;
  language?: string;
  pdf: NonNullable<LibraryBook["pdf"]> | null;
}> {
  if (!officialBookUrl(pageUrl) || /\.pdf$/i.test(new URL(pageUrl).pathname))
    return { landing: false, pdf: null };
  try {
    const { response, url: landingUrl } = await officialFetch(pageUrl);
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("text/html") ||
      Number(response.headers.get("content-length")) > 1_500_000
    )
      return { landing: false, pdf: null };
    const html = await response.text();
    if (html.length > 1_500_000) return { landing: false, pdf: null };
    const languages = [...html.matchAll(/<meta\b[^>]*>/gi)]
      .map((match) => attributes(match[0]))
      .filter((meta) =>
        /^(?:dc\.language(?:\.iso)?|dcterms\.language|citation_language)$/i.test(
          meta["name"] || meta["property"] || "",
        ),
      )
      .map((meta) => meta["content"]?.trim())
      .filter(Boolean);
    const language = [...new Set(languages)].join(", ") || undefined;
    const landing = {
      landing: true,
      url: landingUrl,
      ...(language ? { language } : {}),
      pdf: null,
    };
    const evidence = bookLicenseEvidence(html, landingUrl, title);
    if (!evidence) return landing;
    // A repository can allow downloads while rejecting HEAD. Inspect only the
    // response headers of a ranged GET, then cancel the body; never rehost it.
    let checked;
    try {
      checked = await officialFetch(evidence.url, { method: "HEAD" });
      if (
        [405, 501].includes(checked.response.status) ||
        (checked.response.ok && !checked.response.headers.get("content-type"))
      ) {
        await checked.response.body?.cancel();
        checked = await officialFetch(evidence.url, { headers: { Range: "bytes=0-1023" } });
      }
    } catch {
      return landing;
    }
    const { response: pdf, url: pdfUrl } = checked;
    await pdf.body?.cancel();
    if (!pdf.ok || !pdf.headers.get("content-type")?.toLowerCase().includes("application/pdf"))
      return landing;
    const xfo = pdf.headers.get("x-frame-options"),
      csp = pdf.headers.get("content-security-policy");
    return {
      ...landing,
      pdf: { ...evidence, url: pdfUrl, embeddable: !xfo && !/frame-ancestors/i.test(csp || "") },
    };
  } catch {
    return { landing: false, pdf: null };
  }
}
