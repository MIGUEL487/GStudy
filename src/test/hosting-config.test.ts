import { describe, expect, it } from 'vitest';
import { supabaseConfig } from '@/integrations/supabase/config';
import { aiConfig } from '@/lib/ai-config';
const publicEnv = { VITE_SUPABASE_URL: 'https://project.supabase.co/', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' };
describe('Configuração na hospedagem', () => {
  it('usa as variáveis públicas como fallback no servidor', () => {
    expect(supabaseConfig(publicEnv, {}, true)).toEqual({ url: 'https://project.supabase.co', key: 'sb_publishable_example' });
  });
  it('identifica chaves de projetos diferentes antes de validar o token', () => {
    expect(() => supabaseConfig(publicEnv, { SUPABASE_PUBLISHABLE_KEY: 'other-project-key' }, true)).toThrow('não correspondem');
  });
  it('permite a URL interna do Lovable quando a chave é a mesma', () => {
    expect(supabaseConfig(publicEnv, { SUPABASE_URL: 'https://internal.example.com', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' }, true).url).toBe('https://internal.example.com');
  });
  it('não aceita um ID como URL nem uma chave secreta no cliente', () => {
    expect(() => supabaseConfig({ ...publicEnv, VITE_SUPABASE_URL: 'project-id' })).toThrow('URL');
    expect(() => supabaseConfig({ ...publicEnv, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' })).toThrow('chave pública');
  });
  it('explica quando a chave do Lovable não foi configurada na Vercel', () => {
    expect(() => aiConfig({})).toThrow('IA não está configurada');
  });
  it('preserva o gateway do Lovable e permite outro provedor configurado no servidor', () => {
    expect(aiConfig({ LOVABLE_API_KEY: 'private-test-key' }).lovable).toBe(true);
    const config = aiConfig({ AI_API_KEY: 'other-private-test-key', AI_BASE_URL: 'https://provider.example/v1', AI_MODEL: 'vision-model' });
    expect(config.lovable).toBe(false); expect(config.mode).toBe('chat');
    expect(() => aiConfig({ AI_API_KEY: 'private-test-key' })).toThrow('AI_BASE_URL');
  });
});
