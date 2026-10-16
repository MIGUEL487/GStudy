import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackPanel } from '@/components/feedback-panel';
import { StudyLayout } from '@/components/study-layout';

const location = vi.hoisted(() => ({ pathname: '/aprender/feynman' }));
vi.mock('@tanstack/react-router', () => ({
  useLocation: ({ select }: { select: (value: typeof location) => unknown }) => select(location),
  Link: ({ to, params: _params, children, ...props }: { to: string; params?: unknown; children: ReactNode }) => <a href={to} {...props}>{children}</a>,
}));
vi.mock('@/components/auth-gate', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock('@/components/avatar', () => ({ Avatar: () => <span>AM</span>, useDisplayName: () => 'Ana Maria' }));
vi.mock('@/components/recall-resume', () => ({ RecallResume: () => null }));
vi.mock('@/components/study-session-controls',()=>({useTestFocus:()=>false,RecallTimerPopup:()=>null,FocusSessionHeader:()=>null}));
vi.mock('@/components/account-sync-provider',()=>({SyncStatus:()=>null}));
vi.mock('@/components/study-provider', () => ({ useStudy: () => ({ data: { subjects: [{ id: 'math', name: 'Matemática', emoji: '📘' }] } }) }));

const entry = { id: 'feedback-1', category: 'suggestion', rating: 4, message: 'Gostaria de revisar frações.', createdAt: '2026-10-15T10:00:00.000Z' };
beforeEach(() => { localStorage.clear(); location.pathname = '/aprender/feynman'; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Feedbacks locais', () => {
  it('saves a validated feedback and restores it after remount', () => {
    const view = render(<FeedbackPanel userId="ana" />);
    fireEvent.change(screen.getByLabelText('Conte um pouco mais'), { target: { value: 'O calendário poderia mostrar feriados.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar feedback' }));
    expect(screen.getByRole('status')).toHaveTextContent('Feedback salvo neste dispositivo');
    expect(screen.getByLabelText('Conte um pouco mais')).toHaveValue('');
    view.unmount();
    render(<FeedbackPanel userId="ana" />);
    expect(screen.getByText('O calendário poderia mostrar feriados.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar' })).toBeEnabled();
  });

  it('never shows one account’s feedback when another account is selected', () => {
    localStorage.setItem('gstudy.feedback.v1:ana', JSON.stringify({ version: 1, entries: [entry] }));
    const view = render(<FeedbackPanel userId="ana" />);
    expect(screen.getByText(entry.message)).toBeInTheDocument();
    view.rerender(<FeedbackPanel userId="bruno" />);
    expect(screen.queryByText(entry.message)).not.toBeInTheDocument();
    expect(screen.getByText('0 feedbacks salvos neste dispositivo')).toBeInTheDocument();
  });

  it('preserves an unsaved message and reports blocked storage', () => {
    render(<FeedbackPanel userId="ana" />);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    const message = 'Não consigo trocar a matéria no meu celular.';
    fireEvent.change(screen.getByLabelText('Conte um pouco mais'), { target: { value: message } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar feedback' }));
    expect(screen.getByRole('alert')).toHaveTextContent('O feedback não foi salvo');
    expect(screen.getByLabelText('Conte um pouco mais')).toHaveValue(message);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('preserves invalid stored data and avoids overwriting it', () => {
    const invalid = JSON.stringify({ version: 1, entries: [{ ...entry, category: 'toString' }] });
    localStorage.setItem('gstudy.feedback.v1:ana', invalid);
    render(<FeedbackPanel userId="ana" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Ele foi preservado');
    expect(screen.getByRole('button', { name: 'Salvar feedback' })).toBeDisabled();
    expect(localStorage.getItem('gstudy.feedback.v1:ana')).toBe(invalid);
  });
});

describe('Navegação móvel', () => {
  it('keeps the outlet mounted during location changes so navigation does not regenerate a lesson', () => {
    const mounted = vi.fn(); const unmounted = vi.fn();
    function Lesson() { useEffect(() => { mounted(); return unmounted; }, []); return <p>Atividade em andamento</p>; }
    const view = render(<StudyLayout><Lesson /></StudyLayout>);
    location.pathname = '/aprender/quiz'; view.rerender(<StudyLayout><Lesson /></StudyLayout>);
    expect(mounted).toHaveBeenCalledTimes(1); expect(unmounted).not.toHaveBeenCalled();
  });
  it('offers all main destinations and marks study activities as active', () => {
    const { container } = render(<StudyLayout><p>Lousa</p></StudyLayout>);
    const nav = within(screen.getByRole('navigation', { name: 'Navegação principal no celular' }));
    expect(nav.getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/');
    expect(nav.getByRole('link', { name: 'Calendário' })).toHaveAttribute('href', '/calendario');
    expect(nav.getByRole('link', { name: 'Aprender' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Configurações' })).toHaveAttribute('href', '/configuracoes');
    expect(container.querySelector('.workspace--feynman')).not.toBeInTheDocument();
    expect(screen.queryByText('📘')).not.toBeInTheDocument();
  });
});
