import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-gate';
import { remainingAttempts, reserveAttempt, settleAttempt } from '@/lib/daily-attempts';
import type { ActivityMode } from '@/lib/learning-model';
import { signalAccountChange } from '@/lib/account-sync-model';
const changed = 'gstudy-attempts-changed';
export function useDailyAttempt(mode: ActivityMode) {
  const { user } = useAuth(); const [remaining, setRemaining] = useState(2); const token = useRef<string | undefined>(undefined);
  const refresh = useCallback(() => { try { setRemaining(remainingAttempts(localStorage, user.id, mode)); } catch { setRemaining(0); } }, [user.id, mode]);
  useEffect(() => {
    refresh(); const interval = window.setInterval(refresh, 30000);
    window.addEventListener('storage', refresh); window.addEventListener(changed, refresh); window.addEventListener('focus', refresh);
    return () => { clearInterval(interval); window.removeEventListener('storage', refresh); window.removeEventListener(changed, refresh); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  const begin = useCallback(() => { const id = reserveAttempt(localStorage, user.id, mode); token.current = id; window.dispatchEvent(new Event(changed)); signalAccountChange(); return id; }, [user.id, mode]);
  const settle = useCallback((success: boolean, id?: string) => {
    const current = id ?? token.current; if (!current) return;
    try { settleAttempt(localStorage, user.id, current, success); }
    catch { toast.error('Não foi possível atualizar a tentativa no navegador. O limite reservado foi mantido.'); }
    if (token.current === current) token.current = undefined;
    window.dispatchEvent(new Event(changed));
    signalAccountChange();
  }, [user.id]);
  const succeed = useCallback((id?: string) => settle(true, id), [settle]);
  const fail = useCallback((id?: string) => settle(false, id), [settle]);
  return { begin, succeed, fail, remaining };
}
