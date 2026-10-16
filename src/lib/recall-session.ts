import { z } from 'zod';
import type { LearningSearch } from './learning-model';

export const recallStorageKey = (userId: string) => `gstudy.recall.v1:${userId}`;
export const recallSessionId = (search: LearningSearch) => JSON.stringify([search.p ?? '', search.t ?? '', (search.m ?? '').split(',').filter(Boolean).sort()]);
const material = z.object({ title: z.string().max(180), content: z.string().max(16000), keyPoints: z.array(z.string().max(800)).max(6) });
const grade = z.object({ score: z.number().min(0).max(10), feedback: z.string().max(3000), strengths: z.array(z.string().max(1000)).max(5), gaps: z.array(z.string().max(1000)).max(5), modelAnswer: z.string().max(5000) });
export const recallSessionSchema = z.object({
  phase: z.enum(['intro', 'loading', 'study', 'recall', 'grading', 'result']),
  search: z.object({ p: z.string().max(800).optional(), t: z.string().max(800).optional(), m: z.string().max(800).optional() }),
  topic: z.string().max(200), material: material.nullable(), deadline: z.number().finite().nonnegative().nullable(), answer: z.string().max(8000),
  result: grade.nullable(), progressSaved: z.boolean(), xpAwarded: z.boolean(), updatedAt: z.number().finite().nonnegative(),
}).refine(s => !['study', 'recall', 'grading', 'result'].includes(s.phase) || Boolean(s.material && s.deadline !== null))
  .refine(s => s.phase !== 'result' || Boolean(s.result));
export type RecallSession = z.infer<typeof recallSessionSchema>;
const schema = z.object({ version: z.literal(1), sessions: z.record(z.string(), recallSessionSchema) });
export type RecallSessions = z.infer<typeof schema>;
export const emptyRecallSession: RecallSession = { phase: 'intro', search: {}, topic: '', material: null, deadline: null, answer: '', result: null, progressSaved: false, xpAwarded: false, updatedAt: 0 };
export function readRecallSessions(raw: string | null, now = Date.now()): RecallSessions {
  const data = raw ? schema.parse(JSON.parse(raw)) : { version: 1 as const, sessions: {} };
  // Network requests cannot survive a reload. Their saved material and draft can.
  return { ...data, sessions: Object.fromEntries(Object.entries(data.sessions).map(([id, session]) => [id, {
    ...session, phase: session.phase === 'loading' ? 'intro' : session.phase === 'grading' || (session.phase === 'study' && session.deadline !== null && session.deadline <= now) ? 'recall' : session.phase,
  }])) };
}
