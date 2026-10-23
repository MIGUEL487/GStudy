import type { ActivityMode } from "@/lib/learning-model";

/** Compatibility for existing sessions. Generation has a server technical quota;
 * starting or reviewing never consumes hearts. Old account records stay intact. */
export function useDailyAttempt(_mode: ActivityMode) {
  return {
    remaining: Number.POSITIVE_INFINITY,
    begin: () => crypto.randomUUID(),
    succeed: (_id?: string) => {},
    fail: (_id?: string) => {},
  };
}
