import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Whiteboard, type Board } from '@/components/whiteboard';

const images = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/whiteboard-images', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/whiteboard-images')>(), readBoardImage: images.read }));

const g = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn(), setLineDash: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), arc: vi.fn(), rect: vi.fn(), ellipse: vi.fn(), fillText: vi.fn() };
function mount(disabled = false, variant: 'chalk' | 'paper' = 'chalk') {
  const ref = createRef<Board>(); render(<Whiteboard ref={ref} disabled={disabled} variant={variant} />);
  const canvas = screen.getByLabelText('Lousa para desenhar, inserir texto e formas');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 360, height: 210 } as DOMRect);
  return { ref, canvas };
}
beforeEach(() => {
  vi.clearAllMocks();
  images.read.mockReset();
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
  it('exporta o papel claro em maior resolução com a cor de tinta escolhida', () => {
    const { ref, canvas } = mount(false, 'paper');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 600, height: 360 } as DOMRect);
    expect(canvas).toHaveAttribute('width', '1200'); expect(canvas).toHaveAttribute('height', '720');
    expect(g.fillRect).toHaveBeenCalledWith(0, 0, 1200, 720);
    fireEvent.click(screen.getByRole('button', { name: 'Giz Terracota' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retângulo' }));
    fireEvent.pointerDown(canvas, point(10, 20)); fireEvent.pointerUp(canvas, point(100, 80));
    expect(g.rect).toHaveBeenLastCalledWith(20, 40, 180, 120);
    expect((canvas as HTMLCanvasElement).getContext('2d')?.strokeStyle).toBe('#ac5a3e');
    expect(ref.current?.snapshot()).toContain('data:image/jpeg');
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

const chooseImage = async () => { await act(async () => { fireEvent.change(screen.getByLabelText('Arquivo de imagem para a lousa'), { target: { files: [new File(['image'], 'arte.png', { type: 'image/png' })] } }); }); };
function imageFixture() { const source = document.createElement('canvas'); source.width = 400; source.height = 200; const image = { source, width: 400, height: 200, name: 'arte.png' }; images.read.mockResolvedValue(image); return image; }
describe('Imagens na lousa', () => {
  it('insere a imagem no centro mantendo a proporção e permite desfazer/refazer', async () => {
    const image = imageFixture(); const { ref } = mount(); await chooseImage();
    expect(g.drawImage).toHaveBeenLastCalledWith(image.source, 144, 102, 432, 216);
    expect(screen.getByRole('button', { name: 'Mover imagem' })).toHaveAttribute('aria-pressed', 'true');
    expect(ref.current?.snapshot()).toContain('data:image/jpeg');
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' })); expect(ref.current?.snapshot()).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Refazer' })); expect(ref.current?.snapshot()).toContain('data:image/jpeg');
  });
  it('move a imagem em tela reduzida e desfaz o movimento sem excluir a foto', async () => {
    const image = imageFixture(); const { ref, canvas } = mount(); await chooseImage();
    fireEvent.pointerDown(canvas, point(100, 100)); fireEvent.pointerUp(canvas, point(120, 115));
    expect(g.drawImage).toHaveBeenLastCalledWith(image.source, 184, 132, 432, 216);
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(ref.current?.snapshot()).toContain('data:image/jpeg'); expect(g.drawImage).toHaveBeenLastCalledWith(image.source, 144, 102, 432, 216);
    fireEvent.click(screen.getByRole('button', { name: 'Refazer' })); expect(g.drawImage).toHaveBeenLastCalledWith(image.source, 184, 132, 432, 216);
  });
  it('redimensiona pelo canto e cancela um ajuste incompleto sem gravá-lo no histórico', async () => {
    const image = imageFixture(); const { ref, canvas } = mount(); await chooseImage();
    fireEvent.pointerDown(canvas, point(288, 159)); fireEvent.pointerUp(canvas, point(308, 169));
    expect(g.drawImage).toHaveBeenLastCalledWith(image.source, 144, 102, 472, 236);
    fireEvent.pointerDown(canvas, point(100, 100)); fireEvent.pointerMove(canvas, point(110, 100)); fireEvent.pointerCancel(canvas);
    expect(g.drawImage).toHaveBeenLastCalledWith(image.source, 144, 102, 472, 236);
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' })); expect(ref.current?.snapshot()).toContain('data:image/jpeg'); expect(g.drawImage).toHaveBeenLastCalledWith(image.source, 144, 102, 432, 216);
  });
  it('exporta a foto sem o contorno de seleção e sem um movimento ainda em andamento', async () => {
    const image = imageFixture(); const { ref, canvas } = mount(); await chooseImage();
    fireEvent.pointerDown(canvas, point(100, 100)); fireEvent.pointerMove(canvas, point(120, 115));
    g.strokeRect.mockClear();
    vi.spyOn(canvas as HTMLCanvasElement, 'toDataURL').mockImplementation(() => { expect(g.strokeRect).not.toHaveBeenCalled(); expect(g.drawImage).toHaveBeenLastCalledWith(image.source, 144, 102, 432, 216); return 'data:image/jpeg;base64,board'; });
    expect(ref.current?.snapshot()).toContain('data:image/jpeg');
    expect(g.drawImage).toHaveBeenLastCalledWith(image.source, 184, 132, 432, 216);
  });
  it('mantém a foto ao desenhar por cima e ao desfazer a exclusão', async () => {
    imageFixture(); const { ref, canvas } = mount(); await chooseImage();
    fireEvent.click(screen.getByRole('button', { name: 'Giz' })); fireEvent.pointerDown(canvas, point(30, 40)); fireEvent.pointerUp(canvas, point(70, 80));
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' })); expect(ref.current?.snapshot()).toContain('data:image/jpeg');
    fireEvent.click(screen.getByRole('button', { name: 'Mover imagem' })); fireEvent.pointerDown(canvas, point(100, 100)); fireEvent.pointerUp(canvas, point(100, 100));
    fireEvent.click(screen.getByRole('button', { name: 'Remover imagem' })); expect(ref.current?.snapshot()).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' })); expect(ref.current?.snapshot()).toContain('data:image/jpeg');
  });
  it('preserva a lousa se a imagem falhar e ignora carregamento que termina depois de limpar', async () => {
    const image = imageFixture(); const { ref, canvas } = mount();
    fireEvent.pointerDown(canvas, point(10, 10)); fireEvent.pointerUp(canvas, point(20, 20));
    images.read.mockRejectedValueOnce(new Error('Não foi possível abrir essa imagem.')); await chooseImage(); expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível abrir'); expect(ref.current?.snapshot()).toContain('data:image/jpeg');
    let resolve!: (value: typeof image) => void; images.read.mockReturnValueOnce(new Promise(done => { resolve = done; })); await chooseImage(); expect(ref.current?.isLoading?.()).toBe(true);
    act(() => ref.current?.clear()); await act(async () => { resolve(image); }); expect(ref.current?.snapshot()).toBeUndefined(); expect(ref.current?.isLoading?.()).toBe(false);
  });
  it('bloqueia inserção e ajuste de imagens quando a lousa está desativada', async () => {
    imageFixture(); mount(true); expect(screen.getByRole('button', { name: 'Inserir imagem' })).toBeDisabled(); await chooseImage(); expect(images.read).not.toHaveBeenCalled();
  });
});
