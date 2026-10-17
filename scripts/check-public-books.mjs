// Manual network smoke check; no credentials and no mocked HTTP responses.
// NODE_USE_ENV_PROXY=1 node scripts/check-public-books.mjs
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  cacheDir: "node_modules/.cache/public-books-check",
  server: { middlewareMode: true },
});
try {
  const { searchOpenStaxBooks, checkOpenStaxBook } = await server.ssrLoadModule(
    "/src/lib/openstax-books.server.ts",
  );
  const catalogue = await searchOpenStaxBooks();
  assert(catalogue.available, "The public catalogue could not be queried.");
  const selected = catalogue.books
    .filter((book) => /sociology|economics/i.test(book.title))
    .slice(0, 2);
  const verified = await Promise.all(
    selected.map(async (book) => ({
      title: book.title,
      ...(await checkOpenStaxBook(book.url, book.title)),
    })),
  );
  assert(
    verified.some((book) => book.pdf),
    "No PDF with current work-level permission was verified. Do not bypass the licence checks.",
  );
  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        licensedRecords: catalogue.books.length,
        verified: verified.map((book) => ({
          title: book.title,
          edition: book.editionStatus,
          language: book.language,
          license: book.pdf?.license,
          pdf: book.pdf?.url,
          evidence: book.pdf?.evidenceUrl,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
