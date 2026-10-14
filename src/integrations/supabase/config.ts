type Environment = Record<string, string | undefined>;

export function supabaseConfig(publicEnv: Environment, serverEnv: Environment = {}, server = false) {
  const browserUrl = publicEnv['VITE_SUPABASE_URL']?.trim().replace(/\/+$/, '');
  const browserKey = publicEnv['VITE_SUPABASE_PUBLISHABLE_KEY']?.trim();
  const serverUrl = serverEnv['SUPABASE_URL']?.trim().replace(/\/+$/, '');
  const serverKey = serverEnv['SUPABASE_PUBLISHABLE_KEY']?.trim();
  if (server && browserKey && serverKey && browserKey !== serverKey) {
    throw new Error('As configurações do Supabase no navegador e no servidor não correspondem. Confira as variáveis de ambiente da hospedagem e publique novamente.');
  }
  const url = server ? serverUrl || browserUrl : browserUrl;
  const key = server ? serverKey || browserKey : browserKey;
  if (!url || !key) {
    throw new Error('O Supabase não está configurado. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env ou na hospedagem e publique novamente.');
  }
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
  } catch {
    throw new Error('A URL do Supabase precisa ser completa, como https://seu-projeto.supabase.co.');
  }
  if (key.startsWith('sb_secret_')) throw new Error('Use a chave pública do Supabase na configuração do aplicativo.');
  return { url, key };
}
