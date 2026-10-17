import { z } from "zod";
import { officialBookUrl, type LibraryBook } from "./preparation-library-model";
import { bookLicenseEvidence, officialFetch } from "./book-rights.server";

// Fields and routes: openstax/openstax-cms books/models.py and openstax/api.py.
// Rights come from the individual published book, never the publisher's footer.
const workSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(8).max(250),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  meta: z.object({ type: z.literal("books.Book"), locale: z.string().optional() }),
  book_state: z.literal("live"),
  license_url: z.string(),
  license_name: z.string().nullish(),
  license_text: z.string().nullish(),
  pdf_url: z.string().url(),
  authors: z
    .array(z.object({ type: z.literal("author"), value: z.object({ name: z.string().min(1) }) }))
    .min(1),
});
export function openStaxApi(value: string) {
  try {
    const url = new URL(value);
    return (
      officialBookUrl(value) &&
      url.hostname === "openstax.org" &&
      /^\/apps\/cms\/api\/v2\/pages\/\d+\/$/.test(url.pathname) &&
      !url.search
    );
  } catch {
    return false;
  }
}
function evidence(work: z.infer<typeof workSchema>, url: string) {
  const data = {
    "@type": "Book",
    name: work.title,
    author: work.authors.map((author) => ({ name: author.value.name })),
    license: [work.license_url, work.license_name, work.license_text].filter(Boolean).join(" "),
    encoding: { contentUrl: work.pdf_url },
  };
  return bookLicenseEvidence(
    '<script type="application/ld+json">' +
      JSON.stringify(data).replaceAll("<", "\\u003c") +
      "</script>",
    url,
    work.title,
  );
}
export async function searchOpenStaxBooks() {
  const url = new URL("https://openstax.org/apps/cms/api/v2/pages/");
  url.searchParams.set("type", "books.Book");
  url.searchParams.set(
    "fields",
    "title,slug,book_state,license_url,license_name,license_text,pdf_url,authors",
  );
  url.searchParams.set("limit", "100");
  try {
    const page = async (offset: number) => {
      const target = new URL(url);
      target.searchParams.set("offset", String(offset));
      const { response } = await officialFetch(target.href);
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/json") ||
        Number(response.headers.get("content-length")) > 2_000_000
      ) {
        await response.body?.cancel();
        throw new Error("Catalogue unavailable");
      }
      const body = await response.text();
      if (body.length > 2_000_000) throw new Error("Catalogue too large");
      return z
        .object({
          meta: z.object({ total_count: z.number().int().nonnegative() }).optional(),
          items: z.array(z.unknown()).max(100),
        })
        .parse(JSON.parse(body));
    };
    const first = await page(0),
      rest = await Promise.allSettled(
        [100, 200].filter((offset) => offset < (first.meta?.total_count || 0)).map(page),
      );
    const seen = new Set<number>();
    const books = [
      ...first.items,
      ...rest.flatMap((item) => (item.status === "fulfilled" ? item.value.items : [])),
    ].flatMap((item) => {
      const parsed = workSchema.safeParse(item);
      if (!parsed.success) return [];
      const work = parsed.data,
        url = `https://openstax.org/apps/cms/api/v2/pages/${work.id}/`;
      if (seen.has(work.id) || !evidence(work, url)) return [];
      seen.add(work.id);
      return [
        { title: work.title, url, ...(work.meta.locale ? { language: work.meta.locale } : {}) },
      ];
    });
    return { available: true, books };
  } catch {
    return { available: false, books: [] };
  }
}
export async function checkOpenStaxBook(
  source: string,
  title: string,
): Promise<{
  landing: boolean;
  url?: string;
  language?: string;
  pdf: NonNullable<LibraryBook["pdf"]> | null;
}> {
  if (!openStaxApi(source)) return { landing: false, pdf: null };
  try {
    const { response, url } = await officialFetch(source);
    if (
      !openStaxApi(url) ||
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json") ||
      Number(response.headers.get("content-length")) > 1_500_000
    ) {
      await response.body?.cancel();
      return { landing: false, pdf: null };
    }
    const body = await response.text();
    if (body.length > 1_500_000) return { landing: false, pdf: null };
    const work = workSchema.parse(JSON.parse(body));
    const normalize = (value: string) =>
      value
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLocaleLowerCase("pt-BR")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    if (
      normalize(title) !== normalize(work.title) ||
      new URL(url).pathname !== `/apps/cms/api/v2/pages/${work.id}/`
    )
      return { landing: false, pdf: null };
    const page = await officialFetch("https://openstax.org/details/books/" + work.slug);
    await page.response.body?.cancel();
    if (!page.response.ok || !page.response.headers.get("content-type")?.includes("text/html"))
      return { landing: false, pdf: null };
    const landing = {
      landing: true,
      url: page.url,
      ...(work.meta.locale ? { language: work.meta.locale } : {}),
      pdf: null,
    };
    const rights = evidence(work, url);
    if (!rights) return landing;
    try {
      let pdf = await officialFetch(rights.url, { method: "HEAD" });
      if ([405, 501].includes(pdf.response.status)) {
        await pdf.response.body?.cancel();
        pdf = await officialFetch(rights.url, { headers: { Range: "bytes=0-1023" } });
      }
      await pdf.response.body?.cancel();
      if (
        !pdf.response.ok ||
        !pdf.response.headers.get("content-type")?.includes("application/pdf")
      )
        return landing;
      return {
        ...landing,
        pdf: {
          ...rights,
          url: pdf.url,
          embeddable:
            !pdf.response.headers.get("x-frame-options") &&
            !/frame-ancestors/i.test(pdf.response.headers.get("content-security-policy") || ""),
        },
      };
    } catch {
      return landing;
    }
  } catch {
    return { landing: false, pdf: null };
  }
}
