import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { supabaseConfig } from '@/integrations/supabase/config';

export const requireStudyAuth = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { url, key } = supabaseConfig(import.meta.env, process.env, true);
  const authorization = getRequest().headers.get('authorization');
  const token = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1];
  if (!token || token.split('.').length !== 3) {
    throw new Error('Sua sessão não está disponível. Entre novamente com Google ou Notion.');
  }
  const supabase = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // Validate against this project's Auth service; never trust a decoded JWT alone.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    if (error && (error.status === 0 || (error.status ?? 0) >= 500 || error.name === 'AuthRetryableFetchError')) {
      throw new Error('Não foi possível validar sua sessão agora. Tente novamente em instantes.');
    }
    if (error?.status === 401 && /api.?key/i.test(error.message)) {
      throw new Error('A chave pública do Supabase na hospedagem não corresponde ao projeto. Confira as variáveis e publique novamente.');
    }
    throw new Error('Sua sessão expirou ou pertence a outro projeto do Supabase. Saia da conta e entre novamente. Confira também se as variáveis do servidor e do navegador usam o mesmo projeto.');
  }
  return next({ context: { supabase, userId: data.user.id } });
});
