import { studyPhotoSchema } from "./photo-import-model";
export type StudyPhoto = { dataUrl: string; name: string; width: number; height: number };
export async function prepareStudyPhoto(file: File): Promise<StudyPhoto> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Escolha uma foto JPG, PNG ou WebP. Se estiver em HEIC, salve uma cópia em JPG.",
    );
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error("Escolha uma foto de até 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Não foi possível abrir essa imagem. Escolha outra foto."));
      image.src = url;
    });
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 100_000_000
    )
      throw new Error("A foto é muito grande. Recorte a página e tente novamente.");
    const factor = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto neste navegador.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.92, 0.82, 0.72, 0.6]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (studyPhotoSchema.safeParse(dataUrl).success)
        return { dataUrl, name: file.name, width: canvas.width, height: canvas.height };
    }
    throw new Error(
      "A foto ainda ficou grande para enviar. Recorte apenas a página do caderno ou a tabela de notas.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
