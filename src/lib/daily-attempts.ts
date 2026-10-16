import { z } from 'zod';
import { activityOrder, type ActivityMode } from './learning-model';
export const dailyLimit = 2;
export const attemptKey = (userId: string) => `gstudy.attempts.v1:${userId}`;
const schema = z.object({ version: z.literal(1), entries: z.array(z.object({ id: z.string().uuid(), mode: z.enum(activityOrder), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(['reserved', 'used']) })).max(300).refine(entries => new Set(entries.map(entry => entry.id)).size === entries.length) });
export type AttemptData = z.infer<typeof schema>;
export const localDay = (now = new Date()) => now.toLocaleDateString('sv-SE');
export function readAttempts(raw: string | null): AttemptData {
  try { return raw ? schema.parse(JSON.parse(raw)) : { version: 1, entries: [] }; }
  catch { throw new Error('Não foi possível ler seu limite diário. Seus dados foram preservados; verifique o armazenamento do navegador.'); }
}
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export function remainingAttempts(store: Store, userId: string, mode: ActivityMode, now = new Date()) {
  return Math.max(0, dailyLimit - readAttempts(store.getItem(attemptKey(userId))).entries.filter(e => e.day === localDay(now) && e.mode === mode).length);
}
export function reserveAttempt(store: Store, userId: string, mode: ActivityMode, now = new Date()) {
  const key = attemptKey(userId); const value = readAttempts(store.getItem(key)); const day = localDay(now);
  const entries = value.entries.filter(e => e.day === day);
  if (entries.filter(e => e.mode === mode).length >= dailyLimit) throw new Error('Você já usou as 2 tentativas desta atividade hoje. Continue em outra atividade ou volte amanhã.');
  const id = crypto.randomUUID(); entries.push({ id, mode, day, status: 'reserved' });
  try { store.setItem(key, JSON.stringify({ version: 1, entries })); }
  catch { throw new Error('Não foi possível salvar sua tentativa. Libere espaço no navegador antes de começar.'); }
  return id;
}
export function settleAttempt(store: Store, userId: string, token: string, success: boolean) {
  const key = attemptKey(userId); const value = readAttempts(store.getItem(key));
  const entry = value.entries.find(e => e.id === token);
  if (!entry || entry.status === 'used') return;
  const entries = success ? value.entries.map(e => e.id === token ? { ...e, status: 'used' as const } : e) : value.entries.filter(e => e.id !== token);
  store.setItem(key, JSON.stringify({ version: 1, entries }));
}
