import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), client: vi.fn(), getUser: vi.fn(), getSession: vi.fn(), refreshSession: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({ createMiddleware: () => ({ server: (fn: unknown) => fn, client: (fn: unknown) => fn }) }));
vi.mock('@tanstack/react-start/server', () => ({ getRequest: mocks.request }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.client }));
vi.mock('@/integrations/supabase/config', () => ({ supabaseConfig: () => ({ url: 'https://project.supabase.co', key: 'sb_publishable_example' }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.getSession, refreshSession: mocks.refreshSession } } }));
import { requireStudyAuth } from '@/lib/study-auth-middleware';
import { attachStudyAuth } from '@/lib/study-auth-attacher';
const requireAuth = requireStudyAuth as unknown as (args: { next: ReturnType<typeof vi.fn> }) => Promise<unknown>;
const attachAuth = attachStudyAuth as unknown as (args: { next: ReturnType<typeof vi.fn> }) => Promise<unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue({ auth: { getUser: mocks.getUser } });
  mocks.request.mockReturnValue(new Request('https://app.example/_serverFn/test', { headers: { authorization: 'Bearer header.payload.signature' } }));
});
describe('Sessão nas funções de estudo', () => {
  it('rejeita pedidos sem sessão antes de chamar o provedor de IA', async () => {
    const next = vi.fn(); mocks.request.mockReturnValue(new Request('https://app.example/_serverFn/test'));
    await expect(requireAuth({ next })).rejects.toThrow('Entre novamente');
    expect(next).not.toHaveBeenCalled(); expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it('não aceita um token de formato válido se o serviço Auth o recusar', async () => {
    const next = vi.fn(); mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'Invalid JWT' } });
    await expect(requireAuth({ next })).rejects.toThrow('outro projeto');
    expect(next).not.toHaveBeenCalled();
  });
  it('valida o usuário e passa um cliente que respeita o RLS', async () => {
    const next = vi.fn().mockResolvedValue('ok');
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null });
    await requireAuth({ next });
    expect(mocks.getUser).toHaveBeenCalledWith('header.payload.signature');
    expect(mocks.client).toHaveBeenCalledWith('https://project.supabase.co', 'sb_publishable_example', expect.objectContaining({ global: { headers: { Authorization: 'Bearer header.payload.signature' } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ userId: 'verified-user' }) }));
  });
  it('distingue indisponibilidade do serviço de uma sessão inválida', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
    await expect(requireAuth({ next: vi.fn() })).rejects.toThrow('validar sua sessão agora');
  });
  it('renova a sessão perto de expirar e envia o token novo', async () => {
    const next = vi.fn();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'old-token', expires_at: Math.floor(Date.now() / 1000) + 5 } }, error: null });
    mocks.refreshSession.mockResolvedValue({ data: { session: { access_token: 'new-token' } }, error: null });
    await attachAuth({ next });
    expect(next).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer new-token' } });
  });
  it('não envia uma chamada quando a renovação da sessão falha', async () => {
    const next = vi.fn();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'old-token', expires_at: 1 } }, error: null });
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('expired') });
    await expect(attachAuth({ next })).rejects.toThrow('sessão expirou');
    expect(next).not.toHaveBeenCalled();
  });
});
