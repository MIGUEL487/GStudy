import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateRecall: vi.fn(), gradeRecall: vi.fn(), generateReview: vi.fn(), gradeReview: vi.fn(),
  begin: vi.fn(), succeed: vi.fn(), fail: vi.fn(), complete: vi.fn(), award: vi.fn(), snapshot: vi.fn(), isLoading: vi.fn(), clear: vi.fn(),
  remaining: 2, ready: true, allowed: true, hasContext: true,
}));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({}),
  Link: ({ children, to, search: _search, ...props }: { children: ReactNode; to: string; search?: unknown }) => <a href={to} {...props}>{children}</a>,
}));
vi.mock('@/components/learning-provider', () => ({ useLessonContext: () => ({
  ready: mocks.ready, allowed: mocks.allowed,
  context: mocks.hasContext ? { subject: 'Matemática', topic: 'Teorema de Pitágoras' } : undefined,
  complete: mocks.complete, backSearch: { p: 'plan-1', t: 'topic-1' }, next: { to: '/aprender/feynman', search: { p: 'plan-1', t: 'topic-1' } },
}) }));
vi.mock('@/hooks/use-daily-attempt', () => ({ useDailyAttempt: () => ({ begin: mocks.begin, succeed: mocks.succeed, fail: mocks.fail, remaining: mocks.remaining }) }));
vi.mock('@/lib/learning.functions', () => ({ generateRecallMaterial: mocks.generateRecall, gradeRecall: mocks.gradeRecall, generateReviewChallenge: mocks.generateReview, gradeReview: mocks.gradeReview }));
vi.mock('@/lib/learn-client', () => ({ idsFrom: (value?: string) => value ? value.split(',') : [], awardXp: mocks.award }));
vi.mock('@/components/whiteboard', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return { Whiteboard: forwardRef(function TestBoard({ disabled }: { disabled?: boolean }, ref) {
    useImperativeHandle(ref, () => ({ snapshot: mocks.snapshot, clear: mocks.clear, isLoading: mocks.isLoading }));
    return <div aria-label="Lousa de revisão" aria-disabled={disabled} />;
  }) };
});
import { RecallLesson, RECALL_STUDY_DURATION } from '@/routes/aprender.recall';
import { ReviewLesson } from '@/routes/aprender.revisao';
import { RecallSessionProvider } from '@/components/recall-session-provider';
import { recallStorageKey } from '@/lib/recall-session';
const render = (ui: ReactNode) => renderUI(<RecallSessionProvider userId="test-user">{ui}</RecallSessionProvider>);

const material = { title: 'Os lados de um triângulo', content: 'Em um triângulo retângulo, o quadrado da hipotenusa corresponde à soma dos quadrados dos catetos.', keyPoints: ['Identifique a hipotenusa.', 'Compare as áreas dos quadrados.'] };
const evaluation = { score: 8, feedback: 'Você relacionou corretamente os lados e as áreas.', strengths: ['Identificou a hipotenusa.'], gaps: ['Mostre como as áreas se relacionam.'], modelAnswer: 'Os quadrados construídos sobre os catetos somam a área do quadrado da hipotenusa.' };
const search = { m: 'material-1', p: 'plan-1', t: 'topic-1' };
beforeEach(() => {
  localStorage.clear(); mocks.isLoading.mockReturnValue(false);
  vi.clearAllMocks(); mocks.remaining = 2; mocks.ready = true; mocks.allowed = true; mocks.hasContext = true;
  mocks.complete.mockReturnValue(true); mocks.begin.mockReturnValue('reservation-1'); mocks.award.mockResolvedValue(undefined); mocks.snapshot.mockReturnValue(undefined);
  mocks.generateRecall.mockResolvedValue(material); mocks.gradeRecall.mockResolvedValue(evaluation);
  mocks.generateReview.mockResolvedValue({ prompt: 'Por que c² = a² + b²?', hint: 'Compare as áreas dos quadrados construídos sobre os lados.' }); mocks.gradeReview.mockResolvedValue(evaluation);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const clickAndSettle = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };
const enterRecallWriting = async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
  render(<RecallLesson search={search} />); await clickAndSettle('Começar os 5 minutos');
  await act(async () => { vi.setSystemTime(Date.now() + RECALL_STUDY_DURATION); document.dispatchEvent(new Event('visibilitychange')); });
};

describe('Active Recall com cinco minutos de leitura', () => {
  it('continua a mesma leitura e o prazo ao visitar o caderno e voltar, sem gastar outra tentativa', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    const wrap = (child: ReactNode) => <RecallSessionProvider userId="test-user">{child}</RecallSessionProvider>;
    const view = renderUI(wrap(<RecallLesson search={search} />)); await clickAndSettle('Começar os 5 minutos');
    act(() => { vi.advanceTimersByTime(60000); });
    view.rerender(wrap(<p>Consultando o caderno</p>));
    act(() => { vi.advanceTimersByTime(60000); });
    view.rerender(wrap(<RecallLesson search={search} />));
    expect(screen.getByRole('timer')).toHaveTextContent('3:00');
    expect(screen.getByText(material.content)).toBeInTheDocument();
    expect(mocks.begin).toHaveBeenCalledTimes(1); expect(mocks.generateRecall).toHaveBeenCalledTimes(1);
  });
  it('restaura o resumo após recarregar e não reabre a leitura se o prazo já terminou', async () => {
    await enterRecallWriting();
    fireEvent.change(screen.getByLabelText('Seu resumo de memória'), { target: { value: 'Os quadrados dos catetos somam a área da hipotenusa.' } });
    cleanup(); render(<RecallLesson search={search} />);
    expect(screen.getByLabelText('Seu resumo de memória')).toHaveValue('Os quadrados dos catetos somam a área da hipotenusa.');
    expect(screen.queryByText(material.content)).not.toBeInTheDocument();
    expect(mocks.begin).toHaveBeenCalledTimes(1); expect(mocks.generateRecall).toHaveBeenCalledTimes(1);
  });
  it('guarda a preparação que termina enquanto a pessoa está em outra página', async () => {
    let resolve!: (value: typeof material) => void;
    mocks.generateRecall.mockReturnValue(new Promise(done => { resolve = done; }));
    const wrap = (child: ReactNode) => <RecallSessionProvider userId="test-user">{child}</RecallSessionProvider>;
    const view = renderUI(wrap(<RecallLesson search={search} />));
    fireEvent.click(screen.getByRole('button', { name: 'Começar os 5 minutos' }));
    view.rerender(wrap(<p>Consultando o caderno</p>));
    await act(async () => resolve(material));
    view.rerender(wrap(<RecallLesson search={search} />));
    expect(screen.getByRole('timer')).toBeInTheDocument(); expect(screen.getByText(material.content)).toBeInTheDocument();
    expect(mocks.begin).toHaveBeenCalledTimes(1); expect(mocks.generateRecall).toHaveBeenCalledTimes(1);
  });
  it('mantém a avaliação ao sair durante o envio e não concede XP novamente ao recarregar', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    let resolve!: (value: typeof evaluation) => void; mocks.gradeRecall.mockReturnValue(new Promise(done => { resolve = done; }));
    const wrap = (child: ReactNode) => <RecallSessionProvider userId="test-user">{child}</RecallSessionProvider>;
    const view = renderUI(wrap(<RecallLesson search={search} />)); await clickAndSettle('Começar os 5 minutos');
    act(() => { vi.advanceTimersByTime(RECALL_STUDY_DURATION); });
    fireEvent.change(screen.getByLabelText('Seu resumo de memória'), { target: { value: 'Entendi a relação entre as áreas dos quadrados.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Avaliar meu resumo' }));
    view.rerender(wrap(<p>Caderno</p>)); await act(async () => resolve(evaluation));
    view.rerender(wrap(<RecallLesson search={search} />)); expect(screen.getByLabelText('Nota 8 de 10')).toBeInTheDocument();
    cleanup(); render(<RecallLesson search={search} />); expect(screen.getByLabelText('Nota 8 de 10')).toBeInTheDocument();
    expect(mocks.gradeRecall).toHaveBeenCalledTimes(1); expect(mocks.award).toHaveBeenCalledTimes(1);
  });
  it('avisa se não puder salvar o rascunho e permite salvar novamente sem perder o texto', async () => {
    await enterRecallWriting();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    fireEvent.change(screen.getByLabelText('Seu resumo de memória'), { target: { value: 'Meu resumo ainda precisa ser salvo.' } });
    expect(screen.getByLabelText('Seu resumo de memória')).toHaveValue('Meu resumo ainda precisa ser salvo.');
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar a sessão');
    write.mockRestore(); fireEvent.click(screen.getByRole('button', { name: 'Salvar sessão novamente' }));
    cleanup(); render(<RecallLesson search={search} />); expect(screen.getByLabelText('Seu resumo de memória')).toHaveValue('Meu resumo ainda precisa ser salvo.');
  });
  it('preserva dados corrompidos e não inicia outra tentativa para sobrescrevê-los', () => {
    localStorage.setItem(recallStorageKey('test-user'), '{corrupt'); render(<RecallLesson search={search} />);
    expect(screen.getByRole('alert')).toHaveTextContent('dados salvos foram preservados');
    fireEvent.click(screen.getByRole('button', { name: 'Começar os 5 minutos' }));
    expect(mocks.begin).not.toHaveBeenCalled(); expect(localStorage.getItem(recallStorageKey('test-user'))).toBe('{corrupt');
  });
  it('separa sessões de contas diferentes', async () => {
    render(<RecallLesson search={search} />); await clickAndSettle('Começar os 5 minutos'); cleanup();
    renderUI(<RecallSessionProvider userId="another-user"><RecallLesson search={search} /></RecallSessionProvider>);
    expect(screen.getByRole('button', { name: 'Começar os 5 minutos' })).toBeInTheDocument(); expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });
  it('espera um início explícito e não consome tentativas ao abrir a página', () => {
    render(<RecallLesson search={search} />);
    expect(mocks.generateRecall).not.toHaveBeenCalled(); expect(mocks.begin).not.toHaveBeenCalled();
    expect(screen.getByText(/Disponíveis hoje: 2/)).toBeInTheDocument();
  });
  it('bloqueia a escrita até os cinco minutos terminarem e retira o material da tela', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    render(<RecallLesson search={search} />); await clickAndSettle('Começar os 5 minutos');
    expect(screen.getByRole('timer')).toHaveTextContent('5:00'); expect(screen.getByText(material.content)).toBeInTheDocument();
    expect(mocks.begin).toHaveBeenCalledTimes(1); expect(mocks.succeed).toHaveBeenCalledWith('reservation-1');
    expect(screen.queryByLabelText('Seu resumo de memória')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(RECALL_STUDY_DURATION - 500); });
    expect(screen.getByText(material.content)).toBeInTheDocument(); expect(screen.queryByLabelText('Seu resumo de memória')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByText(material.content)).not.toBeInTheDocument(); expect(screen.getByLabelText('Seu resumo de memória')).toBeInTheDocument();
  });
  it('usa o prazo real ao voltar de uma aba suspensa', async () => {
    await enterRecallWriting();
    expect(screen.getByLabelText('Seu resumo de memória')).toBeInTheDocument(); expect(screen.queryByText(material.content)).not.toBeInTheDocument();
  });
  it('libera a reserva se a IA falhar ao preparar o material', async () => {
    mocks.generateRecall.mockRejectedValueOnce(new Error('O Gemini está ocupado.'));
    render(<RecallLesson search={search} />); await clickAndSettle('Começar os 5 minutos');
    expect(screen.getByRole('alert')).toHaveTextContent('O Gemini está ocupado.'); expect(mocks.fail).toHaveBeenCalledWith('reservation-1'); expect(mocks.succeed).not.toHaveBeenCalled();
  });
  it('mantém o resumo em uma falha e avalia novamente sem gastar outra sessão', async () => {
    mocks.gradeRecall.mockRejectedValueOnce(new Error('Tente avaliar novamente.'));
    await enterRecallWriting(); fireEvent.change(screen.getByLabelText('Seu resumo de memória'), { target: { value: 'As áreas dos quadrados sobre os catetos somam a da hipotenusa.' } });
    await clickAndSettle('Avaliar meu resumo'); expect(screen.getByRole('alert')).toHaveTextContent('Tente avaliar novamente.'); expect(screen.getByLabelText('Seu resumo de memória')).toHaveValue('As áreas dos quadrados sobre os catetos somam a da hipotenusa.');
    await clickAndSettle('Avaliar meu resumo');
    expect(mocks.gradeRecall).toHaveBeenLastCalledWith({ data: { context: { subject: 'Matemática', topic: 'Teorema de Pitágoras' }, ids: ['material-1'], source: material.content, answer: 'As áreas dos quadrados sobre os catetos somam a da hipotenusa.' } });
    expect(mocks.begin).toHaveBeenCalledTimes(1); expect(mocks.complete).toHaveBeenCalledWith('recall'); expect(mocks.award).toHaveBeenCalledExactlyOnceWith(36);
    expect(screen.getByLabelText('Nota 8 de 10')).toBeInTheDocument(); expect(screen.queryByText(evaluation.modelAnswer)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comparar com uma resposta de referência' })); expect(screen.getByText(evaluation.modelAnswer)).toBeInTheDocument();
  });
  it('não gera nada sem um tópico válido ou se a etapa estiver bloqueada', () => {
    mocks.hasContext = false; mocks.allowed = false; render(<RecallLesson search={search} />);
    expect(screen.getByText('Uma ideia de cada vez.')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Começar os 5 minutos' })).not.toBeInTheDocument(); expect(mocks.generateRecall).not.toHaveBeenCalled();
  });
  it('mostra o limite diário antes de iniciar a sessão', () => {
    mocks.remaining = 0; render(<RecallLesson search={search} />); expect(screen.getByRole('button', { name: 'Começar os 5 minutos' })).toBeDisabled();
  });
});

describe('Desafio de síntese com texto e desenho', () => {
  it('preserva a avaliação se o progresso falhar e salva novamente sem outra chamada à IA', async () => {
    mocks.complete.mockReturnValueOnce(false).mockReturnValue(true);
    mocks.snapshot.mockReturnValue('data:image/jpeg;base64,board'); render(<ReviewLesson search={search} />); await clickAndSettle('Abrir meu desafio');
    await clickAndSettle('Enviar minha revisão');
    expect(screen.getByLabelText('Nota 8 de 10')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('progresso não foi salvo');
    expect(mocks.award).not.toHaveBeenCalled();
    await clickAndSettle('Salvar progresso');
    expect(mocks.gradeReview).toHaveBeenCalledTimes(1); expect(mocks.award).toHaveBeenCalledExactlyOnceWith(49);
    expect(screen.queryByRole('button', { name: 'Salvar progresso' })).not.toBeInTheDocument();
  });
  it('revela a ilustração conceitual somente depois da avaliação e da comparação', async () => {
    mocks.snapshot.mockReturnValue('data:image/jpeg;base64,board'); render(<ReviewLesson search={search} />); await clickAndSettle('Abrir meu desafio');
    expect(screen.queryByRole('img', { name: 'As áreas no teorema de Pitágoras' })).not.toBeInTheDocument();
    await clickAndSettle('Enviar minha revisão');
    expect(screen.queryByRole('img', { name: 'As áreas no teorema de Pitágoras' })).not.toBeInTheDocument();
    await clickAndSettle('Comparar com uma resposta de referência');
    expect(screen.getByRole('img', { name: 'As áreas no teorema de Pitágoras' })).toBeInTheDocument();
  });
  it('gera um desafio do tópico e avalia uma resposta feita apenas na lousa', async () => {
    mocks.snapshot.mockReturnValue('data:image/jpeg;base64,board'); render(<ReviewLesson search={search} />); await clickAndSettle('Abrir meu desafio');
    expect(screen.getByText('Por que c² = a² + b²?')).toBeInTheDocument(); expect(screen.queryByText('Compare as áreas dos quadrados construídos sobre os lados.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preciso de uma pista' })); expect(screen.getByText('Compare as áreas dos quadrados construídos sobre os lados.')).toBeInTheDocument();
    await clickAndSettle('Enviar minha revisão');
    expect(mocks.gradeReview).toHaveBeenCalledWith({ data: { context: { subject: 'Matemática', topic: 'Teorema de Pitágoras' }, ids: ['material-1'], answer: '', board: 'data:image/jpeg;base64,board', challenge: 'Por que c² = a² + b²?' } });
    expect(mocks.complete).toHaveBeenCalledWith('review'); expect(mocks.award).toHaveBeenCalledExactlyOnceWith(49); expect(screen.getByLabelText('Nota 8 de 10')).toBeInTheDocument();
  });
  it('pede uma resposta antes de chamar a IA', async () => {
    render(<ReviewLesson search={search} />); await clickAndSettle('Abrir meu desafio'); await clickAndSettle('Enviar minha revisão');
    expect(screen.getByRole('alert')).toHaveTextContent('Escreva uma explicação ou faça um desenho'); expect(mocks.gradeReview).not.toHaveBeenCalled();
  });
  it('preserva o desenho e a explicação ao falhar e não consome outra tentativa', async () => {
    mocks.gradeReview.mockRejectedValueOnce(new Error('O Gemini está ocupado.')); mocks.snapshot.mockReturnValue('data:image/jpeg;base64,board');
    render(<ReviewLesson search={search} />); await clickAndSettle('Abrir meu desafio'); fireEvent.change(screen.getByLabelText('Sua explicação'), { target: { value: 'Comparei as áreas.' } }); await clickAndSettle('Enviar minha revisão');
    expect(screen.getByLabelText('Sua explicação')).toHaveValue('Comparei as áreas.'); expect(mocks.clear).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
    await clickAndSettle('Enviar minha revisão'); expect(mocks.begin).toHaveBeenCalledTimes(1); expect(mocks.award).toHaveBeenCalledTimes(1);
  });
  it('devolve a reserva quando não consegue gerar o desafio', async () => {
    mocks.generateReview.mockRejectedValueOnce(new Error('Falha ao preparar.')); render(<ReviewLesson search={search} />); await clickAndSettle('Abrir meu desafio');
    expect(mocks.fail).toHaveBeenCalledWith('reservation-1'); expect(screen.getByRole('alert')).toHaveTextContent('Falha ao preparar.');
  });
  it('evita envios duplicados enquanto o Gemini está avaliando', async () => {
    let resolve!: (value: typeof evaluation) => void; mocks.gradeReview.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<ReviewLesson search={search} />); await clickAndSettle('Abrir meu desafio'); fireEvent.change(screen.getByLabelText('Sua explicação'), { target: { value: 'A soma das áreas corresponde à hipotenusa.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar minha revisão' })); expect(screen.getByLabelText('Sua explicação')).toBeDisabled(); expect(screen.getByRole('button', { name: 'Avaliando suas conexões…' })).toBeDisabled();
    expect(mocks.gradeReview).toHaveBeenCalledTimes(1); await act(async () => resolve(evaluation)); expect(mocks.award).toHaveBeenCalledTimes(1);
  });
});

it('aguarda a imagem da revisão carregar antes de pedir a avaliação', async () => {
  render(<ReviewLesson search={search} />); await clickAndSettle('Abrir meu desafio');
  mocks.isLoading.mockReturnValue(true);
  await clickAndSettle('Enviar minha revisão');
  expect(screen.getByRole('alert')).toHaveTextContent('Aguarde a imagem terminar de carregar');
  expect(mocks.gradeReview).not.toHaveBeenCalled();
  mocks.isLoading.mockReturnValue(false); mocks.snapshot.mockReturnValue('data:image/jpeg;base64,photo');
  await clickAndSettle('Enviar minha revisão');
  expect(mocks.gradeReview.mock.calls[0]![0].data.board).toBe('data:image/jpeg;base64,photo');
});
