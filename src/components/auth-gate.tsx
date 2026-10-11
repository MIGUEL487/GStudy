import type React from 'react';
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { Button } from '@/components/ui/button';
import { logo } from '@/lib/images';
import { studyImage } from '@/lib/images';

type AuthValue = { user: User; signOut: () => Promise<void> };
const ag = globalThis as { __gstudyAuthContext?: React.Context<AuthValue | null> };
const AuthContext = (ag.__gstudyAuthContext ??= createContext<AuthValue | null>(null));
export const useAuth = () => { const c = useContext(AuthContext); if (!c) throw new Error('AuthGate missing'); return c; };

const schema = z.object({ email: z.string().trim().email('Digite um e-mail válido.').max(255), password: z.string().min(6, 'A senha precisa de pelo menos 6 caracteres.').max(72) });

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') router.invalidate();
    });
    supabase.auth.getUser().then(({ data }) => { setUser(data.user ?? null); setChecking(false); });
    return () => data.subscription.unsubscribe();
  }, [router]);
  const signOut = async () => { await supabase.auth.signOut(); router.navigate({ to: '/', replace: true }); toast.success('Você saiu da conta. Até logo!'); };
  if (checking) return <div className="auth-loading"><img src={logo.url} alt="" />GStudy</div>;
  if (!user) return <LoginScreen />;
  return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;
}

// O login com Google usa a hospedagem do Lovable; em hospedagens externas ele não existe.
const externalHost = (h: string) => /(\.vercel\.app|\.netlify\.app|\.github\.io|\.pages\.dev)$/.test(h);

function LoginScreen() {
  const [googleOk, setGoogleOk] = useState(true);
  useEffect(() => { setGoogleOk(!externalHost(window.location.hostname)); }, []);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
    setBusy(true);
    const res = mode === 'in'
      ? await supabase.auth.signInWithPassword(parsed.data)
      : await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (res.error) return setError(res.error.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : res.error.message);
    if (mode === 'up' && !res.data.session) setSent(true);
  };
  const google = async () => {
    setBusy(true);
    const r = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin });
    if (r.error) { setBusy(false); setError('Não deu para entrar com o Google. Tente novamente.'); }
  };
  return <div className="login-screen">
    <div className="login-panel page-enter">
      <div className="brand login-brand"><img src={logo.url} alt="" />GStudy</div>
      <h1>{mode === 'in' ? 'Bem-vindo(a) de volta!' : 'Quer ingressar nessa?'}</h1>
      <p className="page-subtitle">Seu ritmo. Sua jornada. Entre para continuar estudando.</p>
      {sent ? <p className="login-sent">Enviamos um link de confirmação para <b>{email}</b>. Abra seu e-mail para ativar a conta.</p> : <>
        {googleOk && <><Button variant="outline" className="w-full" disabled={busy} onClick={google}><GoogleMark />Continuar com o Google</Button>
        <div className="login-or"><span>ou</span></div></>}
        <form onSubmit={submit} className="grid gap-3">
          <label className="form-label">E-mail<input className="form-input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label className="form-label">Senha<input className="form-input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : 'Criar conta'}</Button>
        </form>
      </>}
      <button className="login-switch" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); setSent(false); }}>{mode === 'in' ? 'Ainda não tem conta? Criar conta' : 'Já tem conta? Entrar'}</button>
    </div>
    <div className="login-art"><img src={studyImage.url} alt="Mesa de estudos iluminada pelo sol" /></div>
  </div>;
}

function GoogleMark() { return <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>; }
