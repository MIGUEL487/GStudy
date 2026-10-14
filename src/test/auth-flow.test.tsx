import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { onAuthStateChange: vi.fn(), getUser: vi.fn(), signOut: vi.fn() },
  router: { invalidate: vi.fn(), navigate: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
  startOAuth: vi.fn(), captureNotionSession: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: mocks.auth } }));
vi.mock('@/lib/oauth-client', () => ({ startOAuth: mocks.startOAuth, captureNotionSession: mocks.captureNotionSession, oauthError: (e: Error) => e.message }));
vi.mock('@tanstack/react-router', () => ({ useRouter: () => mocks.router }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
import { AuthGate, useAuth } from '@/components/auth-gate';
const member = { id: 'member-1', email: 'aluna@example.com' };
let authEvent: (event: string, session: { user: typeof member; provider_token?: string } | null) => void;
function Workspace() { const { signOut } = useAuth(); return <button onClick={signOut}>Sair dos estudos</button>; }
const renderLogin = async () => { render(<AuthGate><Workspace /></AuthGate>); return screen.findByText('Bem-vindo(a) de volta!'); };
beforeEach(() => {
  vi.clearAllMocks(); window.history.replaceState(null, '', '/'); sessionStorage.clear();
  mocks.auth.onAuthStateChange.mockImplementation(cb => { authEvent = cb; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
  mocks.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.auth.signOut.mockResolvedValue({ error: null });
  mocks.startOAuth.mockResolvedValue(undefined); mocks.captureNotionSession.mockReturnValue(null);
});
afterEach(cleanup);
describe('Entrada social', () => {
  it('mostra Google e Notion sem pedir senha ou enviar e-mail', async () => {
    await renderLogin();
    expect(screen.getByRole('button', { name: 'Continuar com o Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar com o Notion' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
    expect(screen.queryByText('Esqueci a senha')).not.toBeInTheDocument();
  });
  it('inicia a entrada Google', async () => {
    await renderLogin(); fireEvent.click(screen.getByRole('button', { name: 'Continuar com o Google' }));
    await waitFor(() => expect(mocks.startOAuth).toHaveBeenCalledWith('google'));
  });
  it('inicia a entrada Notion', async () => {
    await renderLogin(); fireEvent.click(screen.getByRole('button', { name: 'Continuar com o Notion' }));
    await waitFor(() => expect(mocks.startOAuth).toHaveBeenCalledWith('notion'));
  });
  it('mostra falha do provedor e permite tentar novamente', async () => {
    mocks.startOAuth.mockRejectedValueOnce(new Error('Provedor indisponível'));
    await renderLogin(); fireEvent.click(screen.getByRole('button', { name: 'Continuar com o Notion' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Provedor indisponível');
    expect(screen.getByRole('button', { name: 'Continuar com o Google' })).not.toBeDisabled();
  });
  it('restaura uma conta autenticada', async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user: member }, error: null });
    render(<AuthGate><Workspace /></AuthGate>);
    expect(await screen.findByText('Sair dos estudos')).toBeInTheDocument();
  });
  it('processa autorização Notion fora do callback de autenticação', async () => {
    await renderLogin();
    const session = { user: member, provider_token: 'notion-oauth-token' };
    act(() => authEvent('SIGNED_IN', session));
    await waitFor(() => expect(mocks.captureNotionSession).toHaveBeenCalledWith(session));
  });
  it('encerra a sessão e retorna à entrada', async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user: member }, error: null });
    render(<AuthGate><Workspace /></AuthGate>); fireEvent.click(await screen.findByText('Sair dos estudos'));
    expect(await screen.findByText('Bem-vindo(a) de volta!')).toBeInTheDocument();
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
