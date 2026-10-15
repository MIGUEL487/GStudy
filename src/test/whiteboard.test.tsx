import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Whiteboard, type Board } from '@/components/whiteboard';

const g = { fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), arc: vi.fn(), rect: vi.fn(), ellipse: vi.fn(), fillText: vi.fn() };
function mount(disabled = false) {
  const ref = createRef<Board>(); render(<Whiteboard ref={ref} disabled={disabled} />);
  const canvas = screen.getByLabelText('Lousa para desenhar, inserir texto e formas');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 360, height: 210 } as DOMRect);
  return { ref, canvas };
}
beforeEach(() => {
  vi.clearAllMocks();
  class TestPointerEvent extends MouseEvent { pointerId: number; constructor(type: string, props: PointerEventInit = {}) { super(type, props); this.pointerId = props.pointerId ?? 1; } }
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(g as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,board');
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const point = (x: number, y: number) => ({ clientX: x, clientY: y, button: 0, pointerId: 1 });
describe('Lousa', () => {
  it('exporta as formas com coordenadas corretas em uma tela reduzida, desfaz e refaz', () => {
    const { ref, canvas } = mount(); expect(ref.current?.snapshot()).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Retângulo' }));
    fireEvent.pointerDown(canvas, point(10, 20)); fireEvent.pointerMove(canvas, point(100, 80)); fireEvent.pointerUp(canvas, point(100, 80));
    expect(g.rect).toHaveBeenLastCalledWith(20, 40, 180, 120);
    expect(ref.current?.snapshot()).toContain('data:image/jpeg');
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' })); expect(ref.current?.snapshot()).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Refazer' })); expect(ref.current?.snapshot()).toContain('data:image/jpeg');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar lousa' })); expect(ref.current?.snapshot()).toBeUndefined();
  });
  it('insere texto com quebras de linha na posição escolhida e inclui na imagem', () => {
    const { ref, canvas } = mount(); fireEvent.click(screen.getByRole('button', { name: 'Texto' }));
    fireEvent.change(screen.getByLabelText('Texto na lousa'), { target: { value: 'Água\nH₂O' } });
    fireEvent.pointerDown(canvas, point(20, 15));
    expect(g.fillText).toHaveBeenCalledWith('Água', 40, 30);
    expect(g.fillText).toHaveBeenCalledWith('H₂O', 40, 65);
    expect(ref.current?.snapshot()).toContain('data:image/jpeg');
  });
  it.each(['Elipse', 'Linha', 'Seta'])('inclui %s no desenho exportado', label => {
    const { ref, canvas } = mount(); fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.pointerDown(canvas, point(100, 80)); fireEvent.pointerUp(canvas, point(10, 20));
    expect(ref.current?.snapshot()).toContain('data:image/jpeg');
    if (label === 'Elipse') expect(g.ellipse).toHaveBeenCalledWith(110, 100, 90, 60, 0, 0, Math.PI * 2);
    else expect(g.lineTo).toHaveBeenCalledWith(20, 40);
  });
  it('um clique com giz deixa um ponto visível', () => {
    const { ref, canvas } = mount(); fireEvent.pointerDown(canvas, point(10, 20)); fireEvent.pointerUp(canvas, point(10, 20));
    expect(g.arc).toHaveBeenCalledWith(20, 40, 2, 0, Math.PI * 2);
    expect(ref.current?.snapshot()).toContain('data:image/jpeg');
  });
  it('descarta um gesto cancelado em vez de enviar uma forma incompleta', () => {
    const { ref, canvas } = mount(); fireEvent.pointerDown(canvas, point(10, 20)); fireEvent.pointerMove(canvas, point(40, 50)); fireEvent.pointerCancel(canvas);
    expect(ref.current?.snapshot()).toBeUndefined();
  });
  it('impede edições enquanto a resposta está sendo gerada', () => {
    const { ref, canvas } = mount(true); fireEvent.pointerDown(canvas, point(10, 20)); fireEvent.pointerUp(canvas, point(40, 50));
    expect(ref.current?.snapshot()).toBeUndefined(); expect(screen.getByRole('button', { name: 'Texto' })).toBeDisabled();
  });
});
