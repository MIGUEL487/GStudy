import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ reply: vi.fn(), snapshot: vi.fn(), clear: vi.fn(), award: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => () => ({}), Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => <a href={to} {...props}>{children}</a> }));
vi.mock('@/lib/learn.functions', () => ({ feynmanReply: mocks.reply }));
vi.mock('@/lib/learn-client', () => ({ idsFrom: (value?: string) => value ? value.split(',') : [], awardXp: mocks.award }));
vi.mock('@/components/whiteboard', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return { Whiteboard: forwardRef(function TestBoard({ disabled, variant }: { disabled?: boolean; variant?: string }, ref) {
    useImperativeHandle(ref, () => ({ snapshot: mocks.snapshot, clear: mocks.clear }));
    return <div aria-label="Lousa" data-variant={variant} aria-disabled={disabled} />;
  }) };
});
import { FeynmanLesson } from '@/routes/aprender.feynman';
beforeEach(() => { Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }); vi.clearAllMocks(); mocks.snapshot.mockReturnValue(undefined); mocks.award.mockResolvedValue(undefined); });
afterEach(cleanup);
const start = () => {
  render(<FeynmanLesson materialSearch="material-1" />);
  fireEvent.change(screen.getByPlaceholderText('Qual é o tema da aula? Ex.: Fotossíntese'), { target: { value: 'Fotossíntese' } });
  fireEvent.click(screen.getByRole('button', { name: 'Começar a aula' }));
};
describe('Aula com lousa em destaque e cartão do aluno', () => {
  it('abre a lousa clara e a pergunta do Gui sem gerar uma chamada inicial de IA', () => {
    start(); expect(screen.getByLabelText('Lousa')).toHaveAttribute('data-variant', 'paper');
    expect(within(screen.getByRole('complementary', { name: 'Seu aluno virtual' })).getByText(/Oi, prof!/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Conversa da aula' })).not.toBeInTheDocument();
    expect(mocks.reply).not.toHaveBeenCalled();
  });
  it('envia desenho e texto, mostra espera no cartão e atualiza a pergunta ao concluir', async () => {
    let resolve!: (value: { text: string }) => void;
    mocks.reply.mockReturnValue(new Promise(done => { resolve = done; }));
    mocks.snapshot.mockReturnValue('data:image/jpeg;base64,board'); start();
    fireEvent.change(screen.getByLabelText('Agora é a sua vez'), { target: { value: 'A planta usa luz.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar explicação' }));
    expect(screen.getByRole('button', { name: 'Enviar explicação' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Estou olhando sua explicação');
    expect(mocks.reply).toHaveBeenCalledWith({ data: { topic: 'Fotossíntese', ids: ['material-1'], messages: [{ role: 'user', text: 'A planta usa luz.', board: 'data:image/jpeg;base64,board' }] } });
    await act(async () => resolve({ text: 'E por que a planta precisa de água?' }));
    expect(within(screen.getByRole('complementary', { name: 'Seu aluno virtual' })).getByText('E por que a planta precisa de água?')).toBeInTheDocument();
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Ver conversa' }));
    const history = screen.getByRole('region', { name: 'Conversa da aula' });
    expect(within(history).getByText('A planta usa luz.')).toBeInTheDocument();
    expect(within(history).getByAltText('Desenho enviado na explicação')).toHaveAttribute('src', 'data:image/jpeg;base64,board');
  });
  it('preserva o desenho e o texto para tentar novamente quando a IA falha', async () => {
    mocks.reply.mockRejectedValue(new Error('O Gemini está temporariamente indisponível.')); start();
    fireEvent.change(screen.getByLabelText('Agora é a sua vez'), { target: { value: 'Minha explicação.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar explicação' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O Gemini está temporariamente indisponível.');
    expect(screen.getByLabelText('Agora é a sua vez')).toHaveValue('Minha explicação.'); expect(mocks.clear).not.toHaveBeenCalled();
    expect(within(screen.getByRole('complementary', { name: 'Seu aluno virtual' })).getByText(/Oi, prof!/)).toBeInTheDocument();
  });
  it('mantém mensagens só de texto sem imagem e preserva a nota e o XP', async () => {
    mocks.reply.mockResolvedValue({ text: 'Muito bem! NOTA: 8/10' }); start();
    fireEvent.change(screen.getByLabelText('Agora é a sua vez'), { target: { value: 'Expliquei apenas com palavras.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar explicação' }));
    await waitFor(() => expect(mocks.award).toHaveBeenCalledWith(44));
    expect(mocks.reply.mock.calls[0]![0].data.messages[0]).not.toHaveProperty('board');
    expect(screen.getByRole('progressbar', { name: 'Progresso da aula' })).toHaveAttribute('aria-valuenow', '100');
  });
});
