import { describe, expect, it } from "vitest";
import {
  fitBoardImage,
  moveBoardImage,
  readBoardImage,
  sizeBoardImage,
} from "@/lib/whiteboard-images";

const board = { width: 1200, height: 720 };
describe("Imagens dentro dos limites da lousa", () => {
  it("encaixa fotos altas e panorâmicas sem distorção", () => {
    for (const image of [
      { width: 4000, height: 100 },
      { width: 100, height: 4000 },
    ]) {
      const box = fitBoardImage(image, board);
      expect(box.width / box.height).toBeCloseTo(image.width / image.height);
      expect(box.width).toBeLessThanOrEqual(board.width * 0.6);
      expect(box.height).toBeLessThanOrEqual(board.height * 0.7);
      expect(box.x * 2 + box.width).toBeCloseTo(board.width);
      expect(box.y * 2 + box.height).toBeCloseTo(board.height);
    }
  });
  it("impede que arrastar ou ampliar perca a foto fora da lousa", () => {
    const box = fitBoardImage({ width: 400, height: 200 }, board);
    expect(moveBoardImage(box, -10000, -10000, board)).toMatchObject({ x: 0, y: 0 });
    const edge = moveBoardImage(box, 10000, 10000, board);
    expect(edge.x + edge.width).toBe(board.width);
    expect(edge.y + edge.height).toBe(board.height);
    const larger = sizeBoardImage(edge, 10000, board);
    expect(larger.x + larger.width).toBeLessThanOrEqual(board.width);
    expect(larger.y + larger.height).toBeLessThanOrEqual(board.height);
    expect(larger.width / larger.height).toBeCloseTo(2);
    expect(sizeBoardImage(box, -100, board).width).toBe(30);
  });
  it("recusa formatos incompatíveis e arquivos vazios ou acima de 15 MB antes de decodificar", async () => {
    await expect(
      readBoardImage(new File(["x"], "foto.heic", { type: "image/heic" })),
    ).rejects.toThrow("JPG, PNG ou WebP");
    await expect(readBoardImage(new File([], "vazia.png", { type: "image/png" }))).rejects.toThrow(
      "15 MB",
    );
    const huge = new File(["x"], "grande.jpg", { type: "image/jpeg" });
    Object.defineProperty(huge, "size", { value: 15 * 1024 * 1024 + 1 });
    await expect(readBoardImage(huge)).rejects.toThrow("15 MB");
  });
});
