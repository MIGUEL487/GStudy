import {
  quizDocumentKey,
  quizDocumentSchema,
  quizRecordSchema,
  mergeQuizRecords,
} from "./quiz-progress";
import { z } from "zod";
import { schoolYearSchema } from "./school-year";
import { loadData, storageKey, initialData } from "./study-model";
import { learningKey, readLearning } from "./learning-model";
import { parseRecallSessions, recallStorageKey } from "./recall-session";
import { attemptKey, readAttempts } from "./daily-attempts";
import { socratesStorageKey, readSocratesDocument } from "./socrates-model";

export const namespaces = [
  "workspace",
  "learning",
  "recall",
  "attempts",
  "socrates",
  "quizzes",
] as const;
export type Namespace = (typeof namespaces)[number];
export type Document = Record<string, unknown>;
export type Fingerprint = Record<string, string>;
export const localDocumentKey = (user: string, ns: Namespace) =>
  ns === "quizzes"
    ? quizDocumentKey(user)
    : ns === "workspace"
      ? `${storageKey}:${user}`
      : ns === "learning"
        ? `${learningKey}:${user}`
        : ns === "socrates"
          ? socratesStorageKey(user)
          : ns === "recall"
            ? recallStorageKey(user)
            : attemptKey(user);
const named = z.object({ id: z.string().min(1).max(300), title: z.string() });
const workspace = z.object({
  version: z.literal(1),
  name: z.string(),
  schoolYear: schoolYearSchema.optional(),
  avatar: z.string().optional(),
  attendanceYear: z.number().int().min(2000).max(2100).optional(),
  attendancePeriods: z
    .array(
      z.object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .length(4)
    .optional(),
  subjects: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      notebooks: z.array(named.extend({ text: z.string(), updatedAt: z.string() })),
      courses: z.array(
        named.extend({
          url: z
            .string()
            .url()
            .refine((url) => /^https?:\/\//i.test(url)),
        }),
      ),
    }),
  ),
  performance: z.record(
    z.string(),
    z.object({
      max: z.string(),
      min: z.string(),
      limit: z.string(),
      goal: z.string(),
      grades: z.array(
        z.object({
          score: z.string(),
          absences: z.string(),
          absenceCalendarCount: z.number().int().nonnegative().optional(),
          absenceThrough: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          absencePastCount: z.number().int().nonnegative().optional(),
          behavior: z.string(),
          warnings: z.string(),
        }),
      ),
      sessions: z.array(z.object({ date: z.string(), minutes: z.number() })),
    }),
  ),
});
export function parseAccountDocument(ns: Namespace, value: unknown): Document {
  if (ns === "quizzes") return quizDocumentSchema.parse(value) as unknown as Document;
  if (ns === "workspace") {
    workspace.parse(value);
    return loadData({
      getItem: (key) => (key === storageKey ? JSON.stringify(value) : null),
    }) as unknown as Document;
  }
  if (ns === "learning") return readLearning(JSON.stringify(value)) as unknown as Document;
  if (ns === "recall") return parseRecallSessions(value) as unknown as Document;
  if (ns === "socrates") return readSocratesDocument(JSON.stringify(value)) as unknown as Document;
  return readAttempts(JSON.stringify(value)) as unknown as Document;
}
export function canonical(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Document)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function hash(value: unknown) {
  const text = canonical(value);
  let a = 2166136261,
    b = 2246822519;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 3266489917);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
const part = (path: string, key: string) => `${path}/${encodeURIComponent(key)}`;
const record = (v: unknown): v is Document => !!v && typeof v === "object" && !Array.isArray(v);
const identified = (v: unknown): v is (Document & { id: string })[] =>
  Array.isArray(v) && v.every((item) => record(item) && typeof item["id"] === "string");
export function fingerprint(document: Document): Fingerprint {
  const nodes: Fingerprint = {};
  const visit = (v: unknown, path: string) => {
    nodes[path] = hash(v);
    if (record(v)) Object.entries(v).forEach(([k, value]) => visit(value, part(path, k)));
    else if (identified(v)) v.forEach((item) => visit(item, part(path, `@${item.id}`)));
  };
  visit(document, "");
  return nodes;
}
export function mergeAccountDocuments(
  ns: Namespace,
  base: Fingerprint | undefined,
  local: Document,
  remote: Document,
): { document: Document; copies: number } {
  let copies = 0;
  const changed = (value: unknown, path: string) =>
    base ? hash(value) !== (base[path] ?? hash(undefined)) : value !== undefined;
  const merge = (l: unknown, r: unknown, path: string): unknown => {
    if (canonical(l) === canonical(r)) return l;
    if (base && !changed(l, path)) return r;
    if (base && !changed(r, path)) return l;
    if (l === undefined) return r;
    if (r === undefined) return l;
    if (identified(l) && identified(r)) {
      const left = new Map(l.map((v) => [v.id, v]));
      const right = new Map(r.map((v) => [v.id, v]));
      const result: unknown[] = [];
      for (const id of new Set([...right.keys(), ...left.keys()])) {
        const a = left.get(id),
          b = right.get(id),
          p = part(path, `@${id}`);
        if (
          ns === "workspace" &&
          path.endsWith("/notebooks") &&
          a &&
          b &&
          a["text"] !== b["text"] &&
          changed(a["text"], part(p, "text")) &&
          changed(b["text"], part(p, "text"))
        ) {
          result.push(b);
          if (
            !r.some(
              (n) =>
                n.id !== id &&
                n["text"] === a["text"] &&
                String(n["title"]).endsWith("(cópia deste aparelho)"),
            )
          ) {
            result.push({
              ...a,
              id: crypto.randomUUID(),
              title: `${a["title"]} (cópia deste aparelho)`,
              updatedAt: new Date().toISOString(),
            });
            copies++;
          }
        } else {
          const value = merge(a, b, p);
          if (value !== undefined) result.push(value);
        }
      }
      return result;
    }
    if (record(l) && record(r)) {
      if (
        ns === "quizzes" &&
        typeof l["activity"] === "string" &&
        typeof r["activity"] === "string"
      ) {
        const result = mergeQuizRecords(quizRecordSchema.parse(l), quizRecordSchema.parse(r));
        copies += result.copies.length;
        return result;
      }
      if (ns === "recall" && typeof l["phase"] === "string" && typeof r["phase"] === "string") {
        const newer = Number(l["updatedAt"]) >= Number(r["updatedAt"]) ? l : r,
          older = newer === l ? r : l;
        const alternatives = [
          ...new Set([
            ...(Array.isArray(l["alternateAnswers"]) ? l["alternateAnswers"] : []),
            ...(Array.isArray(r["alternateAnswers"]) ? r["alternateAnswers"] : []),
            ...(l["answer"] && r["answer"] && l["answer"] !== r["answer"] ? [older["answer"]] : []),
          ]),
        ]
          .filter((a) => a !== newer["answer"])
          .slice(-5);
        return { ...newer, ...(alternatives.length ? { alternateAnswers: alternatives } : {}) };
      }
      return Object.fromEntries(
        [...new Set([...Object.keys(r), ...Object.keys(l)])].flatMap((k) => {
          const value = merge(l[k], r[k], part(path, k));
          return value === undefined ? [] : [[k, value]];
        }),
      );
    }
    if (ns === "attempts" && path.endsWith("/status") && (l === "used" || r === "used"))
      return "used";
    return base ? l : r === "" || r === null ? l : r;
  };
  // A new phone's untouched starter workspace must not add defaults to an existing account.
  const pristine =
    ns === "workspace" &&
    !base &&
    canonical(local) === canonical(parseAccountDocument("workspace", initialData()));
  return {
    document: parseAccountDocument(ns, pristine ? remote : (merge(local, remote, "") as Document)),
    copies,
  };
}
export const localChangeEvent = "gstudy-account-local-change";
export function signalAccountChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(localChangeEvent));
}
