export type ImageBox = { x: number; y: number; width: number; height: number };
export type BoardBounds = { width: number; height: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function fitBoardImage(image: BoardBounds, board: BoardBounds): ImageBox {
  const scale = Math.min((board.width * 0.6) / image.width, (board.height * 0.7) / image.height);
  const width = image.width * scale,
    height = image.height * scale;
  return { x: (board.width - width) / 2, y: (board.height - height) / 2, width, height };
}
export function moveBoardImage(
  box: ImageBox,
  dx: number,
  dy: number,
  board: BoardBounds,
): ImageBox {
  return {
    ...box,
    x: clamp(box.x + dx, 0, board.width - box.width),
    y: clamp(box.y + dy, 0, board.height - box.height),
  };
}
export function sizeBoardImage(box: ImageBox, width: number, board: BoardBounds): ImageBox {
  const ratio = box.width / box.height;
  const max = Math.min(board.width - box.x, (board.height - box.y) * ratio);
  const next = clamp(width, Math.min(30, max), max);
  return { ...box, width: next, height: next / ratio };
}
export async function readBoardImage(
  file: File,
): Promise<{ source: HTMLCanvasElement; width: number; height: number; name: string }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Escolha uma imagem JPG, PNG ou WebP. Se estiver em HEIC, salve uma cópia em JPG.",
    );
  if (!file.size || file.size > 15 * 1024 * 1024)
    throw new Error("Escolha uma imagem de até 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Não foi possível abrir essa imagem. Tente outro arquivo."));
      image.src = url;
    });
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 100_000_000
    )
      throw new Error("A imagem é muito grande. Recorte ou reduza a resolução e tente novamente.");
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const source = document.createElement("canvas");
    source.width = Math.max(1, Math.round(image.naturalWidth * scale));
    source.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = source.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem neste navegador.");
    // Keep PNG transparency. No external image URLs reach the board canvas.
    context.drawImage(image, 0, 0, source.width, source.height);
    return { source, width: source.width, height: source.height, name: file.name };
  } finally {
    URL.revokeObjectURL(url);
  }
}
