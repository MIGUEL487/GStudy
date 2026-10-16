import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ generated: null as unknown, activity: vi.fn(), complete: vi.fn(), award: vi.fn(), ready: true, allowed: true }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({}),
  Link: ({ children, to, search, ...props }: { children: ReactNode; to: string; search?: unknown }) => <a href={to} data-search={JSON.stringify(search)} {...props}>{children}</a>,
}));
vi.mock('@/hooks/use-generated-activity', () => ({ useGeneratedActivity: (...args: unknown[]) => { mocks.activity(...args); return { result: mocks.generated, error: '', reload: vi.fn(), remaining: 1 }; } }));
vi.mock('@/components/learning-provider', () => ({ useLessonContext: () => ({
  ready: mocks.ready, allowed: mocks.allowed, context: { subject: 'Matemática', topic: 'Frações' }, topic: { title: 'Frações' },
  complete: mocks.complete, backSearch: { p: 'plan-1' }, next: { to: '/aprender/quiz', search: { p: 'plan-1', t: 'topic-1' } },
}) }));
vi.mock('@/lib/learn-client', () => ({ awardXp: mocks.award }));
import { FlashcardsLesson } from '@/routes/aprender.flashcards';
import { QuizLesson } from '@/routes/aprender.quiz';
import { ExplanationsLesson } from '@/routes/aprender.explicacoes';
const search = { p: 'plan-1', t: 'topic-1' };
beforeEach(() => { vi.clearAllMocks(); mocks.ready = true; mocks.allowed = true; mocks.generated = null; mocks.complete.mockReturnValue(true); mocks.award.mockResolvedValue(undefined); });
afterEach(cleanup);

describe('Atividades conectadas à trilha', () => {
  it('mostra uma só face da carta, mantém os acentos e só conclui depois de lembrar', async () => {
    mocks.generated = { mode: 'flashcards', cards: { cards: [{ front: 'O que é uma fração?', back: 'É uma relação entre uma parte e o todo.' }] } };
    render(<FlashcardsLesson search={search} />);
    const question = await screen.findByRole('button', { name: /O que é uma fração/ });
    expect(screen.queryByText('É uma relação entre uma parte e o todo.')).not.toBeInTheDocument();
    fireEvent.click(question);
    expect(screen.queryByText('O que é uma fração?')).not.toBeInTheDocument();
    expect(screen.getByText('É uma relação entre uma parte e o todo.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar depois' }));
    expect(mocks.complete).not.toHaveBeenCalled(); expect(mocks.award).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /O que é uma fração/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Eu lembrei' }));
    expect(await screen.findByText('Conexões na memória!')).toBeInTheDocument();
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith('flashcards');
    expect(mocks.award).toHaveBeenCalledExactlyOnceWith(2);
    expect(screen.getByRole('link', { name: 'Próxima atividade' })).toHaveAttribute('data-search', JSON.stringify({ p: 'plan-1', t: 'topic-1' }));
  });

  it('não avança nem concede XP se o progresso não puder ser salvo', async () => {
    mocks.complete.mockReturnValue(false);
    mocks.generated = { mode: 'flashcards', cards: { cards: [{ front: 'Pergunta de revisão', back: 'Resposta de revisão' }] } };
    render(<FlashcardsLesson search={search} />);
    fireEvent.click(await screen.findByRole('button', { name: /Pergunta de revisão/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Eu lembrei' }));
    expect(screen.queryByText('Conexões na memória!')).not.toBeInTheDocument();
    expect(screen.getByText('Resposta de revisão')).toBeInTheDocument();
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it('continua o quiz depois de três erros e conclui após revisar todas as respostas', async () => {
    mocks.generated = { mode: 'quiz', quiz: { questions: Array.from({ length: 4 }, (_, i) => ({ question: `Pergunta ${i + 1}?`, options: [`Correta ${i + 1}`, `Incorreta ${i + 1}`], answer: 0, why: `Explicação ${i + 1}.` })) } };
    render(<QuizLesson search={search} />);
    for (let i = 1; i <= 4; i += 1) {
      expect(await screen.findByText(`Pergunta ${i}?`)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`Incorreta ${i}`) }));
      fireEvent.click(screen.getByRole('button', { name: 'Conferir resposta' }));
      expect(screen.getByRole('status')).toHaveTextContent(`Explicação ${i}.`);
      fireEvent.click(screen.getByRole('button', { name: i === 4 ? 'Concluir quiz' : 'Próxima pergunta' }));
    }
    expect(await screen.findByText('Cada tentativa ensina.')).toBeInTheDocument();
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith('quiz');
    expect(mocks.award).toHaveBeenCalledExactlyOnceWith(5);
  });

  it('conclui explicações depois da leitura do último conceito', async () => {
    mocks.generated = { mode: 'explain', explain: { topics: [{ title: 'Numerador', explanation: 'Conta as partes.', example: 'Em 2/3, o numerador é 2.' }, { title: 'Denominador', explanation: 'Define a divisão.', example: 'Em 2/3, o denominador é 3.' }] } };
    render(<ExplanationsLesson search={search} />);
    expect(await screen.findByRole('heading', { name: 'Numerador' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo conceito' }));
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Denominador' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Concluir leitura' }));
    expect(await screen.findByText('As ideias ganharam forma.')).toBeInTheDocument();
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith('explain');
    expect(mocks.award).toHaveBeenCalledExactlyOnceWith(15);
  });

  it('aguarda a trilha e impede gerar conteúdo de uma etapa bloqueada', async () => {
    mocks.ready = false;
    const page = render(<QuizLesson search={search} />);
    expect(mocks.activity).toHaveBeenLastCalledWith('quiz', undefined, { subject: 'Matemática', topic: 'Frações' }, false);
    mocks.ready = true; mocks.allowed = false; page.rerender(<QuizLesson search={search} />);
    expect(await screen.findByText(/Esta etapa ainda não está disponível/)).toBeInTheDocument();
    expect(mocks.activity).toHaveBeenLastCalledWith('quiz', undefined, { subject: 'Matemática', topic: 'Frações' }, false);
    expect(screen.getByRole('link', { name: 'Voltar à trilha' })).toHaveAttribute('href', '/aprender');
  });
});
