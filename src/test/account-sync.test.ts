import { describe, expect, it } from "vitest";
import {
  canonical,
  fingerprint,
  localDocumentKey,
  mergeAccountDocuments,
  parseAccountDocument,
  type Document,
} from "@/lib/account-sync-model";
import { initialData, type StudyData } from "@/lib/study-model";
import { emptyRecallSession } from "@/lib/recall-session";

const workspace = () =>
  parseAccountDocument("workspace", {
    ...initialData(),
    name: "Ana",
    subjects: [
      {
        id: "math",
        name: "Matemática",
        notebooks: [{ id: "notes", title: "Áreas", text: "Original", updatedAt: "2026-10-16" }],
        courses: [],
      },
    ],
  });
const edit = (document: Document, text: string) => {
  const next = structuredClone(document) as unknown as StudyData;
  next.subjects[0]!.notebooks[0]!.text = text;
  return next as unknown as Document;
};
const notes = (document: Document) => (document as unknown as StudyData).subjects[0]!.notebooks;

describe("Mesclagem dos aparelhos por conta", () => {
  it("preserva conversas de Sócrates e turnos escritos em dois aparelhos", () => {
    const conversation = {
      id: crypto.randomUUID(),
      title: "Frações",
      subject: "Matemática",
      createdAt: new Date().toISOString(),
      messages: [],
    };
    const original = parseAccountDocument("socrates", {
      version: 1,
      conversations: [conversation],
    });
    const message = (text: string) => ({
      id: crypto.randomUUID(),
      role: "user",
      text,
      createdAt: new Date().toISOString(),
    });
    const phone = message("Dúvida do celular"),
      desktop = message("Dúvida do computador");
    const local = { version: 1, conversations: [{ ...conversation, messages: [phone] }] };
    const remote = { version: 1, conversations: [{ ...conversation, messages: [desktop] }] };
    const result = mergeAccountDocuments("socrates", fingerprint(original), local, remote);
    expect(result.document).toMatchObject({
      conversations: [{ messages: expect.arrayContaining([phone, desktop]) }],
    });
    expect(localDocumentKey("alice", "socrates")).not.toBe(localDocumentKey("bob", "socrates"));
  });
  it("combina campos diferentes sem guardar o texto no histórico de comparação", () => {
    const original = workspace(),
      local = { ...original, name: "Nome do celular" },
      remote = { ...original, avatar: "data:image/png;base64,photo" };
    const base = fingerprint(original),
      result = mergeAccountDocuments("workspace", base, local, remote);
    expect(result.document).toMatchObject({ name: "Nome do celular", avatar: remote.avatar });
    expect(JSON.stringify(base)).not.toContain("Original");
  });
  it("traz uma edição remota sem criar cópia se o caderno local não mudou", () => {
    const original = workspace(),
      remote = edit(original, "Novo texto do computador");
    const result = mergeAccountDocuments("workspace", fingerprint(original), original, remote);
    expect(notes(result.document)).toHaveLength(1);
    expect(notes(result.document)[0]!.text).toBe("Novo texto do computador");
    expect(result.copies).toBe(0);
  });
  it("preserva duas edições concorrentes do mesmo caderno e não duplica a cópia no retry", () => {
    const original = workspace(),
      local = edit(original, "Texto do celular"),
      remote = edit(original, "Texto do computador");
    const result = mergeAccountDocuments("workspace", fingerprint(original), local, remote);
    expect(notes(result.document).map((n) => n.text)).toEqual([
      "Texto do computador",
      "Texto do celular",
    ]);
    expect(notes(result.document)[1]!.title).toBe("Áreas (cópia deste aparelho)");
    expect(result.copies).toBe(1);
    const retried = mergeAccountDocuments(
      "workspace",
      fingerprint(original),
      local,
      result.document,
    );
    expect(notes(retried.document)).toHaveLength(2);
    expect(retried.copies).toBe(0);
  });
  it("propaga exclusão com base conhecida, preservando edições concorrentes", () => {
    const original = workspace(),
      removed = structuredClone(original) as unknown as StudyData;
    removed.subjects[0]!.notebooks = [];
    expect(
      notes(
        mergeAccountDocuments(
          "workspace",
          fingerprint(original),
          removed as unknown as Document,
          original,
        ).document,
      ),
    ).toEqual([]);
    const changed = edit(original, "Edição ainda não enviada");
    expect(
      notes(
        mergeAccountDocuments(
          "workspace",
          fingerprint(original),
          removed as unknown as Document,
          changed,
        ).document,
      )[0]!.text,
    ).toBe("Edição ainda não enviada");
  });
  it("ignora os padrões de um aparelho novo e preserva matérias renomeadas no primeiro envio", () => {
    const fresh = parseAccountDocument("workspace", initialData()),
      remote = workspace();
    expect(canonical(mergeAccountDocuments("workspace", undefined, fresh, remote).document)).toBe(
      canonical(remote),
    );
    const renamed = initialData();
    renamed.subjects[0]!.name = "Geometria";
    const result = mergeAccountDocuments(
      "workspace",
      undefined,
      parseAccountDocument("workspace", renamed),
      remote,
    );
    expect(
      (result.document as unknown as StudyData).subjects.some((s) => s.name === "Geometria"),
    ).toBe(true);
  });
  it("combina tentativas com IDs diferentes e mantém a consumida numa disputa de status", () => {
    const id = "11111111-1111-4111-8111-111111111111",
      another = "22222222-2222-4222-8222-222222222222";
    const a = { id, mode: "quiz", day: "2026-10-16", status: "reserved" };
    const original = { version: 1, entries: [a] },
      local = { version: 1, entries: [{ ...a, status: "used" }] },
      remote = { version: 1, entries: [a, { ...a, id: another }] };
    expect(
      mergeAccountDocuments("attempts", fingerprint(original), local, remote).document,
    ).toEqual({
      version: 1,
      entries: [
        { ...a, status: "used" },
        { ...a, id: another },
      ],
    });
  });
  it("preserva o resumo alternativo e não recupera fases durante a validação de transporte", () => {
    const original = {
      version: 1,
      sessions: { one: { ...emptyRecallSession, answer: "Antes", updatedAt: 1 } },
    };
    const local = {
      version: 1,
      sessions: { one: { ...emptyRecallSession, answer: "Celular", updatedAt: 2 } },
    };
    const remote = {
      version: 1,
      sessions: { one: { ...emptyRecallSession, answer: "Computador", updatedAt: 3 } },
    };
    const merged = mergeAccountDocuments("recall", fingerprint(original), local, remote);
    expect(merged.document).toMatchObject({
      sessions: { one: { answer: "Computador", alternateAnswers: ["Celular"] } },
    });
    expect(
      parseAccountDocument("recall", {
        version: 1,
        sessions: { one: { ...emptyRecallSession, phase: "loading" } },
      }),
    ).toMatchObject({ sessions: { one: { phase: "loading" } } });
  });
  it("usa chaves separadas por conta e rejeita dados inválidos antes de gravar", () => {
    expect(localDocumentKey("ana", "workspace")).not.toBe(localDocumentKey("bruno", "workspace"));
    expect(() =>
      parseAccountDocument("workspace", {
        ...initialData(),
        subjects: [{ id: "x", name: "X", notebooks: [{ id: "n", text: 3 }], courses: [] }],
      }),
    ).toThrow();
    expect(() => parseAccountDocument("learning", { version: 2, plans: [] })).toThrow();
  });
});
