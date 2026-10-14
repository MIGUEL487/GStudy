import type React from 'react';
import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { Button } from '@/components/ui/button';
import { logo, studyImage } from '@/lib/images';

type AuthValue = { user: User; signOut: () => Promise<void> };
const ag = globalThis as { __gstudyAuthContext?: React.Context<AuthValue | null> };
const AuthContext = (ag.__gstudyAuthContext ??= createContext<AuthValue | null>(null));
export const useAuth = () => { const c = useContext(AuthContext); if (!c) throw new Error('AuthGate missing'); return c; };
const emailSchema = z.string().trim().email('Digite um e-mail válido.').max(255);
const passwordSchema = z.string().min(6, 'A senha precisa de pelo menos 6 caracteres.').max(72);
const recoveryKey = 'gstudy-password-recovery';

function authError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';
  if (/Invalid login/i.test(message)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(message)) return 'Confirme seu e-mail pelo link recebido antes de entrar.';
  if (/rate limit|too many|after \d+ seconds/i.test(message)) return 'Aguarde um pouco antes de solicitar outro e-mail.';
  if (/sending.*email|SMTP/i.test(message)) return 'Não foi possível enviar o e-mail. Confira a configuração SMTP no Supabase.';
  if (/Failed to fetch|NetworkError/i.test(message)) return 'Não foi possível conectar. Confira sua conexão e tente novamente.';
  return message;
}

function clearRecoveryLocation() {
  sessionStorage.removeItem(recoveryKey);
  const url = new URL(window.location.href);
  url.searchParams.delete('auth');
  url.searchParams.delete('error');
  url.searchParams.delete('error_code');
  url.searchParams.delete('error_description');
  url.hash = '';
  window.history.replaceState(window.history.state, '', url.pathname + url.search);
}

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const [recoveryVerified, setRecoveryVerified] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');
  const currentUser = useRef<string | undefined>(undefined);
  useEffect(() => {
    let active = true;
    let authRevision = 0;
    let unsubscribe = () => {};
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const recovering = url.searchParams.get('auth') === 'recovery' || hash.get('type') === 'recovery' || sessionStorage.getItem(recoveryKey) === '1';
    setRecovery(recovering);
    const failedLink = hash.has('error') || url.searchParams.has('error');
    setRecoveryVerified(!failedLink && sessionStorage.getItem(recoveryKey) === '1');
    if (failedLink) setError('Este link expirou ou já foi usado. Solicite um novo e-mail.');
    try {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        if (event !== 'INITIAL_SESSION') authRevision++;
        setUser(session?.user ?? null);
        if (event === 'PASSWORD_RECOVERY') {
          sessionStorage.setItem(recoveryKey, '1');
          setRecovery(true);
          setRecoveryVerified(true);
          setError('');
        }
        if (event === 'SIGNED_OUT') {
          sessionStorage.removeItem(recoveryKey);
          setRecovery(false);
          setRecoveryVerified(false);
        }
        if (currentUser.current !== session?.user.id) {
          currentUser.current = session?.user.id;
          void router.invalidate();
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
      const revision = authRevision;
      void supabase.auth.getUser().then(({ data, error: authFailure }) => {
        if (!active) return;
        if (revision === authRevision) setUser(data.user ?? null);
        if (authFailure && authFailure.name !== 'AuthSessionMissingError') setError(authError(authFailure));
      }).catch(e => { if (active) setError(authError(e)); })
        .finally(() => { if (active) setChecking(false); });
    } catch (e) { setError(authError(e)); setChecking(false); }
    return () => { active = false; unsubscribe(); };
  }, [router]);
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      await router.navigate({ to: '/', replace: true });
      toast.success('Você saiu da conta. Até logo!');
    } catch (e) { toast.error(authError(e)); }
  };
  if (checking) return <div className="auth-loading"><img src={logo.url} alt="" />GStudy</div>;
  if (!user || recovery || registering) return <LoginScreen recovery={recovery} authenticated={!!user && recoveryVerified} initialError={error} onRegistering={setRegistering} onRecovered={() => { clearRecoveryLocation(); setRecovery(false); setRecoveryVerified(false); setError(''); }} />;
  return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;
}

const externalHost = (h: string) => /(\.vercel\.app|\.netlify\.app|\.github\.io|\.pages\.dev)$/.test(h);
type Mode = 'in' | 'up' | 'forgot' | 'reset';

function LoginScreen({ recovery, authenticated, initialError, onRegistering, onRecovered }: {
  recovery: boolean; authenticated: boolean; initialError: string;
  onRegistering: (value: boolean) => void; onRecovered: () => void;
}) {
  const [googleOk, setGoogleOk] = useState(true);
  useEffect(() => { setGoogleOk(!externalHost(window.location.hostname)); }, []);
  const [mode, setMode] = useState<Mode>(recovery ? 'reset' : 'in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => { if (recovery) setMode('reset'); }, [recovery]);
  useEffect(() => { if (initialError) setError(initialError); }, [initialError]);
  const changeMode = (next: Mode) => { setMode(next); setError(''); setSent(false); setPassword(''); setConfirmation(''); };
  const requestAnotherLink = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      onRecovered(); changeMode('forgot');
    } catch (e) { setError(authError(e)); }
    finally { setBusy(false); }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    const parsedEmail = emailSchema.safeParse(email);
    const parsedPassword = passwordSchema.safeParse(password);
    if (mode !== 'reset' && !parsedEmail.success) return setError(parsedEmail.error.issues[0]?.message ?? 'E-mail inválido.');
    if (mode !== 'forgot' && !parsedPassword.success) return setError(parsedPassword.error.issues[0]?.message ?? 'Senha inválida.');
    if (mode === 'reset' && password !== confirmation) return setError('As duas senhas precisam ser iguais.');
    if (mode === 'reset' && !authenticated) return setError('Abra o link de recuperação recebido por e-mail. Se ele expirou, solicite outro.');
    setBusy(true);
    if (mode === 'up') onRegistering(true);
    try {
      const redirectTo = new URL('./', window.location.origin).href;
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data!, { redirectTo: redirectTo + '?auth=recovery' });
        if (error) throw error;
        setSent(true);
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.updateUser({ password: parsedPassword.data! });
        if (error) throw error;
        const logout = await supabase.auth.signOut({ scope: 'local' });
        if (logout.error) throw logout.error;
        onRecovered(); changeMode('in');
        toast.success('Senha atualizada! Entre com sua nova senha.');
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email: parsedEmail.data!, password: parsedPassword.data!, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (data.session) {
          const logout = await supabase.auth.signOut({ scope: 'local' });
          if (logout.error) throw logout.error;
          setError('A confirmação de e-mail está desativada no Supabase. Ative “Confirm email” no provedor de e-mail para exigir a confirmação no cadastro.');
        } else { setEmail(parsedEmail.data!); setSent(true); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: parsedEmail.data!, password: parsedPassword.data! });
        if (error) throw error;
      }
    } catch (e) { setError(authError(e)); }
    finally { setBusy(false); onRegistering(false); }
  };
  const google = async () => {
    setBusy(true); setError('');
    try {
      const r = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin });
      if (r.error) throw r.error;
    } catch { setError('Não deu para entrar com o Google. Tente novamente.'); }
    finally { setBusy(false); }
  };
  return <div className="login-screen">
    <div className="login-panel page-enter">
      <div className="brand login-brand"><img src={logo.url} alt="" />GStudy</div>
      <h1>{mode === 'in' ? 'Bem-vindo(a) de volta!' : mode === 'up' ? 'Quer ingressar nessa?' : mode === 'forgot' ? 'Esqueceu a senha?' : 'Crie sua nova senha'}</h1>
      <p className="page-subtitle">{mode === 'forgot' ? 'Digite seu e-mail para receber um link de recuperação.' : mode === 'reset' ? 'Escolha uma nova senha para continuar sua jornada.' : 'Seu ritmo. Sua jornada. Entre para continuar estudando.'}</p>
      {sent ? <p className="login-sent" role="status">{mode === 'forgot' ? <>Se existir uma conta com <b>{email.trim()}</b>, você receberá um link para criar uma nova senha. Confira também o spam.</> : <>Enviamos um link de confirmação para <b>{email}</b>. Abra seu e-mail para ativar a conta.</>}</p> : <>
        {googleOk && (mode === 'in' || mode === 'up') && <><Button variant="outline" className="w-full" disabled={busy} onClick={google}><GoogleMark />Continuar com o Google</Button>
        <div className="login-or"><span>ou</span></div></>}
        <form onSubmit={submit} className="grid gap-3">
          {mode !== 'reset' && <label className="form-label">E-mail<input className="form-input" type="email" autoComplete="email" required maxLength={255} disabled={busy} value={email} onChange={e => setEmail(e.target.value)} /></label>}
          {mode !== 'forgot' && <label className="form-label">{mode === 'reset' ? 'Nova senha' : 'Senha'}<input className="form-input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={6} maxLength={72} disabled={busy} value={password} onChange={e => setPassword(e.target.value)} /></label>}
          {mode === 'reset' && <label className="form-label">Confirmar nova senha<input className="form-input" type="password" autoComplete="new-password" required minLength={6} maxLength={72} disabled={busy} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>}
          {mode === 'in' && <button type="button" className="login-switch" disabled={busy} onClick={() => changeMode('forgot')}>Esqueci a senha</button>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {mode === 'reset' && !authenticated && !error && <p className="form-error" role="alert">Abra o link de recuperação recebido por e-mail. Se ele expirou, solicite outro.</p>}
          <Button type="submit" disabled={busy || (mode === 'reset' && !authenticated)}>{busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : mode === 'up' ? 'Criar conta' : mode === 'forgot' ? 'Enviar link de recuperação' : 'Salvar nova senha'}</Button>
        </form>
      </>}
      <button className="login-switch" disabled={busy} onClick={() => {
        if (mode === 'reset') { void requestAnotherLink(); }
        else changeMode(mode === 'in' ? 'up' : 'in');
      }}>{mode === 'in' ? 'Ainda não tem conta? Criar conta' : mode === 'reset' ? 'Solicitar outro link de recuperação' : mode === 'forgot' ? 'Voltar para entrar' : 'Já tem conta? Entrar'}</button>
    </div>
    <div className="login-art"><img src={studyImage.url} alt="Mesa de estudos iluminada pelo sol" /></div>
  </div>;
}

function GoogleMark() { return <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>; }
