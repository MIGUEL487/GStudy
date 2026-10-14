import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { onAuthStateChange: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), signUp: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn() },
  router: { invalidate: vi.fn(), navigate: vi.fn() }, toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: mocks.auth } }));
vi.mock('@/integrations/lovable', () => ({ lovable: { auth: { signInWithOAuth: vi.fn() } } }));
vi.mock('@tanstack/react-router', () => ({ useRouter: () => mocks.router }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
import { AuthGate } from '@/components/auth-gate';

const member = { id: 'member-1', email: 'aluna@example.com', email_confirmed_at: '2026-10-14' };
let authEvent: (event: string, session: { user: typeof member } | null) => void;
const renderLogin = async () => {
  render(<AuthGate><div>Área de estudo</div></AuthGate>);
  return screen.findByText('Bem-vindo(a) de volta!');
};
beforeEach(() => {
  vi.clearAllMocks(); window.history.replaceState(null, '', '/'); sessionStorage.clear();
  mocks.auth.onAuthStateChange.mockImplementation(cb => { authEvent = cb; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
  mocks.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.auth.signOut.mockImplementation(async () => { authEvent('SIGNED_OUT', null); return { error: null }; });
  mocks.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.auth.updateUser.mockResolvedValue({ data: { user: member }, error: null });
});
afterEach(cleanup);

describe('Login e recuperação por e-mail', () => {
  it('envia a recuperação sem pedir senha, com retorno para a própria hospedagem', async () => {
    await renderLogin(); fireEvent.click(screen.getByText('Esqueci a senha'));
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'aluna@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de recuperação' }));
    await screen.findByRole('status');
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledWith('aluna@example.com', { redirectTo: window.location.origin + '/?auth=recovery' });
    expect(screen.getByRole('status')).toHaveTextContent('Se existir uma conta');
  });
  it('permite tentar novamente quando o envio de recuperação falha', async () => {
    mocks.auth.resetPasswordForEmail.mockRejectedValueOnce(new Error('Failed to fetch'));
    await renderLogin(); fireEvent.click(screen.getByText('Esqueci a senha'));
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'aluna@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de recuperação' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Enviar link de recuperação' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('mostra a confirmação e não abre o aplicativo antes dela', async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    await renderLogin(); fireEvent.click(screen.getByText('Ainda não tem conta? Criar conta'));
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'aluna@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByRole('status')).toHaveTextContent('link de confirmação');
    expect(screen.queryByText('Área de estudo')).not.toBeInTheDocument();
  });
  it('identifica a confirmação desligada sem anunciar um e-mail que não foi enviado', async () => {
    mocks.auth.signUp.mockImplementation(async () => {
      authEvent('SIGNED_IN', { user: member });
      return { data: { session: { user: member } }, error: null };
    });
    await renderLogin(); fireEvent.click(screen.getByText('Ainda não tem conta? Criar conta'));
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'aluna@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('desativada');
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(screen.queryByText('Área de estudo')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('explica que é preciso confirmar o e-mail antes de entrar', async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ error: new Error('Email not confirmed') });
    await renderLogin();
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'aluna@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirme seu e-mail');
  });
  it('salva a nova senha e pede login após uma recuperação válida', async () => {
    window.history.replaceState(null, '', '/?auth=recovery');
    sessionStorage.setItem('gstudy-password-recovery', '1');
    mocks.auth.getUser.mockResolvedValue({ data: { user: member }, error: null });
    render(<AuthGate><div>Área de estudo</div></AuthGate>);
    await screen.findByText('Crie sua nova senha');
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'senha-nova' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'senha-nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    await screen.findByText('Bem-vindo(a) de volta!');
    expect(mocks.auth.updateUser).toHaveBeenCalledWith({ password: 'senha-nova' });
    expect(window.location.search).toBe('');
  });
  it('não aceita senhas diferentes nem recuperação sem uma sessão', async () => {
    window.history.replaceState(null, '', '/?auth=recovery');
    render(<AuthGate><div>Área de estudo</div></AuthGate>);
    await screen.findByText('Crie sua nova senha');
    expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('link de recuperação');
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
  it('abre o formulário de recuperação mesmo se o link criar uma sessão autenticada', async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user: member }, error: null });
    render(<AuthGate><div>Área de estudo</div></AuthGate>);
    await screen.findByText('Área de estudo');
    act(() => authEvent('PASSWORD_RECOVERY', { user: member }));
    expect(await screen.findByText('Crie sua nova senha')).toBeInTheDocument();
    expect(screen.queryByText('Área de estudo')).not.toBeInTheDocument();
  });
  it('não usa uma sessão antiga para aceitar um link de recuperação expirado', async () => {
    window.history.replaceState(null, '', '/?auth=recovery#error=access_denied&error_code=otp_expired');
    mocks.auth.getUser.mockResolvedValue({ data: { user: member }, error: null });
    render(<AuthGate><div>Área de estudo</div></AuthGate>);
    await screen.findByText('Crie sua nova senha');
    expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('link expirou');
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
  it('permite solicitar outro link mesmo quando existe uma sessão antiga', async () => {
    window.history.replaceState(null, '', '/?auth=recovery#error=access_denied');
    mocks.auth.getUser.mockResolvedValue({ data: { user: member }, error: null });
    render(<AuthGate><div>Área de estudo</div></AuthGate>);
    await screen.findByText('Crie sua nova senha');
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar outro link de recuperação' }));
    await screen.findByText('Esqueceu a senha?');
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(window.location.hash).toBe('');
    expect(screen.queryByText('Área de estudo')).not.toBeInTheDocument();
  });
  it('não troca a senha se a confirmação estiver diferente', async () => {
    window.history.replaceState(null, '', '/?auth=recovery');
    sessionStorage.setItem('gstudy-password-recovery', '1');
    mocks.auth.getUser.mockResolvedValue({ data: { user: member }, error: null });
    render(<AuthGate><div>Área de estudo</div></AuthGate>);
    await screen.findByText('Crie sua nova senha');
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'senha-nova' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'senha-diferente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(screen.getByRole('alert')).toHaveTextContent('precisam ser iguais');
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
  it('sai do carregamento quando a configuração ou conexão falha', async () => {
    mocks.auth.getUser.mockRejectedValue(new Error('Failed to fetch'));
    await renderLogin();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível conectar');
  });
});
