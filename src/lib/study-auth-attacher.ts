import { createMiddleware } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';

export const attachStudyAuth = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Entre na sua conta para usar seus materiais de estudo.');
  let session = data.session;
  if (session.expires_at && session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) {
      throw new Error('Sua sessão expirou. Saia da conta e entre novamente.');
    }
    session = refreshed.data.session;
  }
  return next({ headers: { Authorization: `Bearer ${session.access_token}` } });
});
