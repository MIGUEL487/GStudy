import { Link } from '@tanstack/react-router';
import { X, Flame, Gem } from 'lucide-react';
import type { ReactNode } from 'react';

export function LessonShell({ progress, children, hearts, title }: { progress: number; children: ReactNode; hearts?: number; title: string }) {
  return <div className="lesson">
    <div className="lesson-top">
      <Link to="/aprender" className="lesson-close" aria-label="Sair da lição"><X size={20} /></Link>
      <div className="lesson-bar" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><span style={{ width: `${Math.max(3, progress * 100)}%` }} /></div>
      {hearts !== undefined && <span className="lesson-hearts" aria-label={`${hearts} vidas`}>❤️ {hearts}</span>}
    </div>
    {children}
  </div>;
}

export function Thinking({ text }: { text: string }) {
  return <div className="lesson-thinking" role="status" aria-live="polite"><div className="owl-bounce" aria-hidden="true">🦉</div><p>{text}</p><div className="dots" aria-hidden="true"><i /><i /><i /></div></div>;
}

export function Finish({ xp, title, line, again }: { xp: number; title: string; line: string; again: () => void }) {
  return <div className="lesson-finish">
    <div className="finish-burst">🎉</div>
    <h1>{title}</h1>
    <p className="page-subtitle">{line}</p>
    <div className="finish-stats"><div><Gem size={18} /><strong>+{xp}</strong><small>XP</small></div><div><Flame size={18} /><strong>Ofensiva</strong><small>mantida</small></div></div>
    <div className="flex flex-wrap justify-center gap-3"><button className="duo-btn ghost" onClick={again}>Fazer de novo</button><Link to="/aprender" className="duo-btn">Continuar</Link></div>
  </div>;
}

export function ErrorBox({ message, retry }: { message: string; retry: () => void }) {
  return <div className="lesson-thinking"><div>😕</div><p>{message}</p><button className="duo-btn" onClick={retry}>Tentar de novo</button></div>;
}
