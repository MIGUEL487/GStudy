import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ reply: vi.fn(), isLoading: vi.fn(), snapshot: vi.fn(), clear: vi.fn(), award: vi.fn(), begin: vi.fn(), succeed: vi.fn(), fail: vi.fn(), complete: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => () => ({}), Link: ({ children, to, search: _search, ...props }: { children: ReactNode; to: string; search?: unknown }) => <a href={to} {...props}>{children}</a> }));
vi.mock('@/lib/learn.functions', () => ({ feynmanReply: mocks.reply }));
vi.mock('@/lib/learn-client', () => ({ idsFrom: (value?: string) => value ? value.split(',') : [], awardXp: mocks.award }));
vi.mock('@/components/learning-provider', () => ({ useLessonContext: () => ({ ready: true, allowed: true, complete: mocks.complete, backSearch: {}, context: undefined }) }));
vi.mock('@/hooks/use-daily-attempt', () => ({ useDailyAttempt: () => ({ remaining: 2, begin: mocks.begin, succeed: mocks.succeed, fail: mocks.fail }) }));
vi.mock('@/components/whiteboard', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return { Whiteboard: forwardRef(function TestBoard({ disabled, variant }: { disabled?: boolean; variant?: string }, ref) {
    useImperativeHandle(ref, () => ({ snapshot: mocks.snapshot, clear: mocks.clear, isLoading: mocks.isLoading }));
    return <div aria-label="Lousa" data-variant={variant} aria-disabled={disabled} />;
  }) };
});
import { FeynmanLesson } from '@/routes/aprender.feynman';
beforeEach(() => { Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }); vi.clearAllMocks(); mocks.isLoading.mockReturnValue(false); mocks.reply.mockReset(); mocks.begin.mockReset().mockReturnValue('session-token'); mocks.snapshot.mockReturnValue(undefined); mocks.award.mockResolvedValue(undefined); });
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
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Agora é a sua vez').compareDocumentPosition(screen.getByLabelText('Lousa')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('envia desenho e texto, mostra espera no cartão e atualiza a pergunta ao concluir', async () => {
    let resolve!: (value: { text: string }) => void;
    mocks.reply.mockReturnValue(new Promise(done => { resolve = done; }));
    mocks.snapshot.mockReturnValue('data:image/jpeg;base64,board'); start();
    fireEvent.change(screen.getByLabelText('Agora é a sua vez'), { target: { value: 'A planta usa luz.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar explicação' }));
    expect(screen.getByRole('button', { name: 'Enviar explicação' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Estou olhando sua explicação');
    expect(mocks.reply).toHaveBeenCalledWith({ data: { topic: 'Fotossíntese', ids: ['material-1'], studentId: 'gui', messages: [{ role: 'user', text: 'A planta usa luz.', board: 'data:image/jpeg;base64,board' }] } });
    await act(async () => resolve({ text: 'E por que a planta precisa de água?' }));
    expect(within(screen.getByRole('complementary', { name: 'Seu aluno virtual' })).getByText('E por que a planta precisa de água?')).toBeInTheDocument();
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.succeed).toHaveBeenCalledWith('session-token');
    fireEvent.click(screen.getByRole('button', { name: 'Ver conversa' }));
    const history = screen.getByRole('region', { name: 'Conversa da aula' });
    expect(within(history).getByText('A planta usa luz.')).toBeInTheDocument();
    expect(within(history).getByAltText('Desenho enviado na explicação')).toHaveAttribute('src', 'data:image/jpeg;base64,board');
  });
  it('aguarda a imagem carregar antes de reservar uma tentativa ou enviar a explicação', async () => {
    mocks.reply.mockResolvedValue({ text: 'O que você percebe nas cores?' });
    mocks.isLoading.mockReturnValue(true); start();
    fireEvent.change(screen.getByLabelText('Agora é a sua vez'), { target: { value: 'Minha imagem de referência.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar explicação' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Aguarde a imagem terminar de carregar');
    expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.reply).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Agora é a sua vez')).toHaveValue('Minha imagem de referência.');
    mocks.isLoading.mockReturnValue(false); mocks.snapshot.mockReturnValue('data:image/jpeg;base64,photo');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar explicação' }));
    await waitFor(() => expect(mocks.clear).toHaveBeenCalled());
    expect(mocks.reply.mock.calls[0]![0].data.messages[0].board).toBe('data:image/jpeg;base64,photo');
    expect(mocks.begin).toHaveBeenCalledTimes(1);
  });
  it('preserva o desenho e o texto para tentar novamente quando a IA falha', async () => {
    mocks.reply.mockRejectedValue(new Error('O Gemini está temporariamente indisponível.')); start();
    fireEvent.change(screen.getByLabelText('Agora é a sua vez'), { target: { value: 'Minha explicação.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar explicação' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O Gemini está temporariamente indisponível.');
    expect(screen.getByLabelText('Agora é a sua vez')).toHaveValue('Minha explicação.'); expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith('session-token');
    expect(within(screen.getByRole('complementary', { name: 'Seu aluno virtual' })).getByText(/Oi, prof!/)).toBeInTheDocument();
  });
  it('mantém mensagens só de texto sem imagem e preserva a nota e o XP', async () => {
    mocks.reply.mockResolvedValue({ text: 'Muito bem! NOTA: 8/10' }); start();
    fireEvent.change(screen.getByLabelText('Agora é a sua vez'), { target: { value: 'Expliquei apenas com palavras.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar explicação' }));
    await waitFor(() => expect(mocks.award).toHaveBeenCalledWith(44));
    expect(mocks.reply.mock.calls[0]![0].data.messages[0]).not.toHaveProperty('board');
    expect(screen.getByRole('progressbar', { name: 'Progresso da aula' })).toHaveAttribute('aria-valuenow', '100');
    expect(mocks.complete).toHaveBeenCalledWith('feynman');
  });
  it('troca os alunos e envia a persona selecionada sem alterar os autores anteriores', async () => {
    mocks.reply.mockResolvedValue({ text: 'Você consegue explicar por que isso funciona?' }); start();
    fireEvent.click(within(screen.getByRole('group', { name: 'Escolher aluno' })).getByRole('button', { name: 'Lia' }));
    expect(within(screen.getByRole('complementary', { name: 'Seu aluno virtual' })).getByText(/Oi, sou a Lia!/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Agora é a sua vez'), { target: { value: 'A luz fornece energia para a planta.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar explicação' }));
    await waitFor(() => expect(mocks.clear).toHaveBeenCalled());
    expect(mocks.reply.mock.calls[0]![0].data.studentId).toBe('lia');
    expect(mocks.reply.mock.calls[0]![0].data.messages[0]).not.toHaveProperty('studentId');
    fireEvent.click(screen.getByRole('button', { name: 'Ver conversa' }));
    const history = screen.getByRole('region', { name: 'Conversa da aula' });
    expect(within(history).getByText('Gui')).toBeInTheDocument();
    expect(within(history).getAllByText('Lia')).toHaveLength(2);
  });
  it('usa uma tentativa por conversa e impede o primeiro envio quando o limite foi atingido', async () => {
    mocks.reply.mockResolvedValue({ text: 'Pode dar mais um exemplo?' }); start();
    for (const value of ['Primeira explicação.', 'Outro exemplo.']) {
      fireEvent.change(screen.getByLabelText('Agora é a sua vez'), { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: 'Enviar explicação' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar explicação' })).not.toBeDisabled());
    }
    expect(mocks.begin).toHaveBeenCalledTimes(1);
    expect(mocks.succeed).toHaveBeenCalledTimes(1);
    cleanup(); mocks.reply.mockClear(); mocks.begin.mockImplementation(() => { throw new Error('Você já fez duas aulas hoje.'); }); start();
    fireEvent.change(screen.getByLabelText('Agora é a sua vez'), { target: { value: 'Uma nova aula.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar explicação' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Você já fez duas aulas hoje.');
    expect(screen.getByLabelText('Agora é a sua vez')).toHaveValue('Uma nova aula.');
    expect(mocks.reply).not.toHaveBeenCalled();
  });
});
