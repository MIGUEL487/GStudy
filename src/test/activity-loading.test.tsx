import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@/lib/learn.functions', () => ({ generateActivity: mocks.generate }));
vi.mock('@/lib/learn-client', () => ({ idsFrom: (m?: string) => m ? m.split(',') : [] }));
// Simulate a wrapper whose identity changes on every render.
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => fn(...args) }));
import { useGeneratedActivity } from '@/hooks/use-generated-activity';
const quiz = { mode: 'quiz', quiz: { questions: [{ question: 'Q', options: ['A', 'B'], answer: 0, why: 'W' }] } };
function deferred() { let resolve!: (value: typeof quiz) => void; const promise = new Promise<typeof quiz>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
describe('Carregamento das atividades', () => {
  it('faz uma geração durante o StrictMode e mantém a chamada após novos renders', async () => {
    const request = deferred(); mocks.generate.mockReturnValue(request.promise);
    const { result, rerender } = renderHook(() => useGeneratedActivity('quiz'), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    rerender(); rerender();
    await act(async () => request.resolve(quiz));
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(result.current.result).toEqual(quiz);
  });
  it('ignora uma resposta antiga depois da troca de material', async () => {
    const old = deferred(), current = deferred();
    mocks.generate.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { result, rerender } = renderHook(({ m }) => useGeneratedActivity('quiz', m), { initialProps: { m: 'old' } });
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    rerender({ m: 'new' });
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
    await act(async () => old.resolve(quiz));
    expect(result.current.result).toBeNull();
    await act(async () => current.resolve(quiz));
    expect(result.current.result).toEqual(quiz);
  });
  it('mostra o erro e só gera de novo quando a pessoa tenta novamente', async () => {
    mocks.generate.mockRejectedValueOnce(new Error('Sessão expirada')).mockResolvedValueOnce(quiz);
    const { result, rerender } = renderHook(() => useGeneratedActivity('quiz'));
    await waitFor(() => expect(result.current.error).toBe('Sessão expirada'));
    rerender(); expect(mocks.generate).toHaveBeenCalledTimes(1);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.result).toEqual(quiz));
    expect(result.current.error).toBe(''); expect(mocks.generate).toHaveBeenCalledTimes(2);
  });
});
