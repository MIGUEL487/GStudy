import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Whiteboard, type Board } from "@/components/whiteboard";

const g = {
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  strokeRect: vi.fn(),
  setLineDash: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  arc: vi.fn(),
  rect: vi.fn(),
  ellipse: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 40 })),
};

function mount() {
  const ref = createRef<Board>();
  render(<Whiteboard ref={ref} />);
  const canvas = screen.getByLabelText("Lousa para desenhar, inserir texto e formas");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 360,
    height: 210,
  } as DOMRect);
  return { ref, canvas };
}

beforeEach(() => {
  vi.clearAllMocks();
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, props: PointerEventInit = {}) {
      super(type, props);
      this.pointerId = props.pointerId ?? 1;
    }
  }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    g as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,board",
  );
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const point = (x: number, y: number) => ({ clientX: x, clientY: y, button: 0, pointerId: 1 });

describe("Whiteboard Cursor de Texto e Navegação", () => {
  it("abre cursor sobreposto ao clicar com ferramenta texto, Enter confirma e abre abaixo", () => {
    const { ref, canvas } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Texto" }));

    // Clicar na lousa abre o cursor de texto sobreposto
    fireEvent.pointerDown(canvas, point(50, 40));

    const input = screen.getByLabelText("Cursor de texto da lousa") as HTMLInputElement;
    expect(input).toBeDefined();

    // Digita fórmula na linha 0
    fireEvent.change(input, { target: { value: "x^2 + y^2 = r^2" } });

    // Shift+Enter não confirma
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByLabelText("Cursor de texto da lousa")).toBeDefined();

    // Enter confirma linha 0 e abre linha 1 logo abaixo
    fireEvent.keyDown(input, { key: "Enter" });

    // O input continua aberto para a nova linha
    const nextInput = screen.getByLabelText("Cursor de texto da lousa") as HTMLInputElement;
    expect(nextInput.value).toBe("");

    // Digita segunda linha
    fireEvent.change(nextInput, { target: { value: "a_1 = 10" } });

    // Backspace em linha vazia voltaria, mas com texto não apaga linha
    fireEvent.keyDown(nextInput, { key: "Enter" });

    // Fecha com Esc
    fireEvent.keyDown(screen.getByLabelText("Cursor de texto da lousa"), { key: "Escape" });
    expect(screen.queryByLabelText("Cursor de texto da lousa")).toBeNull();

    // A imagem exportada inclui o texto
    expect(ref.current?.snapshot()).toContain("data:image/jpeg");
  });

  it("Backspace em linha vazia volta para editar a linha anterior do bloco", () => {
    const { canvas } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Texto" }));
    fireEvent.pointerDown(canvas, point(30, 30));

    const input = screen.getByLabelText("Cursor de texto da lousa") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Primeira linha" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Estamos na linha 1 com valor vazio
    const line2Input = screen.getByLabelText("Cursor de texto da lousa") as HTMLInputElement;
    expect(line2Input.value).toBe("");

    // Backspace na linha vazia volta para linha anterior
    fireEvent.keyDown(line2Input, { key: "Backspace" });

    const restoredInput = screen.getByLabelText("Cursor de texto da lousa") as HTMLInputElement;
    expect(restoredInput.value).toBe("Primeira linha");
  });

  it("apaga linha de texto com a borracha", () => {
    const { ref, canvas } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Texto" }));
    fireEvent.pointerDown(canvas, point(50, 40));

    const input = screen.getByLabelText("Cursor de texto da lousa") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Texto para apagar" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Cursor de texto da lousa"), { key: "Escape" });

    expect(ref.current?.snapshot()).toBeDefined();

    // Seleciona borracha e passa sobre o texto (x=50, y=40)
    fireEvent.click(screen.getByRole("button", { name: "Apagador" }));
    fireEvent.pointerDown(canvas, point(50, 40));
    fireEvent.pointerUp(canvas, point(50, 40));

    // Desfaz o texto apagado
    expect(ref.current?.snapshot()).toBeUndefined();
  });

  it("permite ligar e desligar fórmulas na barra de ferramentas", () => {
    mount();
    const toggle = screen.getByRole("button", { name: "Fórmulas matemáticas" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("permite selecionar tamanhos P, M e G", () => {
    mount();
    const btnP = screen.getByRole("button", { name: "Tamanho P" });
    const btnM = screen.getByRole("button", { name: "Tamanho M" });
    const btnG = screen.getByRole("button", { name: "Tamanho G" });

    expect(btnM).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btnG);
    expect(btnG).toHaveAttribute("aria-pressed", "true");
    expect(btnM).toHaveAttribute("aria-pressed", "false");
  });
});
