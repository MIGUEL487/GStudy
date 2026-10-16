import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoLesson, OpenBook, PreparationLibraryPanel } from "@/components/preparation-library";
import {
  amazonProduct,
  amazonSearch,
  officialBookUrl,
  videoEmbedUrl,
  youtubeId,
  preparationLibrarySchema,
} from "@/lib/preparation-library-model";
import { libraryBook, libraryFixture, libraryVideo } from "./helpers/library-fixture";
import { preparationGuide } from "./helpers/preparation-fixture";
import type { LearningPlan } from "@/lib/learning-model";
afterEach(() => cleanup());
describe("Player oficial e identidade do canal", () => {
  it("incorpora somente o trecho confirmado, com controles e nome/logo reais do canal", () => {
    const view = render(<VideoLesson video={libraryVideo} topic="Equações" />);
    const iframe = screen.getByTitle(libraryVideo.title),
      url = new URL(iframe.getAttribute("src")!);
    expect(url.origin).toBe("https://www.youtube-nocookie.com");
    expect(url.pathname).toBe("/embed/abcdefghijk");
    expect(url.searchParams.get("start")).toBe("3600");
    expect(url.searchParams.get("end")).toBe("7200");
    expect(url.searchParams.get("autoplay")).toBeNull();
    expect(url.searchParams.get("controls")).toBe("1");
    expect(screen.getByRole("link", { name: /NO CANAL Universo Narrado/ })).toHaveAttribute(
      "href",
      libraryVideo.channelUrl,
    );
    expect(view.container.querySelector(".library-channel-avatar img")).toHaveAttribute(
      "src",
      libraryVideo.avatarUrl,
    );
    expect(screen.getByText(/Trecho pelos capítulos/)).toBeInTheDocument();
  });
  it("permite trocar de capítulo e assistir à aula inteira, preservando atribuição e controles", () => {
    render(<VideoLesson video={libraryVideo} topic="Equações" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
    expect(
      new URL(screen.getByTitle(libraryVideo.title).getAttribute("src")!).searchParams.get("start"),
    ).toBe("7200");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "full" } });
    expect(
      new URL(screen.getByTitle(libraryVideo.title).getAttribute("src")!).searchParams.has("start"),
    ).toBe(false);
    expect(screen.getByRole("link", { name: "Ver aula inteira no YouTube" })).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=abcdefghijk",
    );
  });
  it("não cria iframe para um vídeo que bloqueou incorporação", () => {
    const view = render(
      <VideoLesson video={{ ...libraryVideo, embeddable: false }} topic="Equações" />,
    );
    expect(view.container.querySelector("iframe")).toBeNull();
    expect(screen.getByText("Este vídeo não permite reprodução incorporada.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Assistir no YouTube" })).toHaveAttribute(
      "href",
      expect.stringContaining("youtube.com/watch"),
    );
  });
});
describe("PDFs autorizados e Amazon separados", () => {
  it("abre o documento original autorizado, com autoria, licença e origem visíveis", () => {
    const view = render(<OpenBook book={libraryBook} topic="Equações" />);
    expect(view.container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ler no GStudy" }));
    expect(screen.getByTitle("Leitura: " + libraryBook.title)).toHaveAttribute(
      "src",
      libraryBook.pdf!.url,
    );
    expect(screen.getByRole("link", { name: "Licença CC BY" })).toHaveAttribute(
      "href",
      libraryBook.pdf!.licenseUrl,
    );
    expect(screen.getByRole("link", { name: "Origem e direitos do material" })).toHaveAttribute(
      "href",
      libraryBook.officialUrl,
    );
    expect(screen.getByText("Documento original, sem alterações.")).toBeInTheDocument();
  });
  it("respeita bloqueio de iframe de um PDF autorizado", () => {
    render(
      <OpenBook
        book={{ ...libraryBook, pdf: { ...libraryBook.pdf!, embeddable: false } }}
        topic="Equações"
      />,
    );
    expect(screen.queryByRole("button", { name: "Ler no GStudy" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PDF na fonte oficial" })).toHaveAttribute(
      "href",
      libraryBook.pdf!.url,
    );
  });
  it("separa a biblioteca aberta da Amazon e de catálogos com licença não confirmada", () => {
    const plan = {
      id: "plan",
      subject: "Matemática",
      topics: [{ title: "Equações" }, { title: "Problemas" }],
      preparation: { research: { sources: [] }, guide: preparationGuide },
    } as unknown as LearningPlan;
    render(
      <PreparationLibraryPanel
        plan={plan}
        library={{
          ...libraryFixture,
          books: [
            ...libraryFixture.books,
            {
              title: "Livro com restrição",
              author: "Outro autor",
              topicIndex: 0,
              reason: "Catálogo de referência, sem autorização de uso do PDF.",
              access: "official",
              officialUrl: "https://biblioteca.exemplo.edu.br/catalogo/restrito",
            },
          ],
        }}
        busy={false}
        error=""
        refresh={vi.fn()}
        unsaved={false}
      />,
    );
    expect(screen.getByRole("heading", { name: "Biblioteca gratuita." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Livros na Amazon." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver livro na Amazon" })).toHaveAttribute(
      "href",
      "https://www.amazon.com.br/dp/8501011665",
    );
    expect(screen.getByRole("link", { name: "Consultar catálogo oficial" })).toHaveAttribute(
      "href",
      "https://biblioteca.exemplo.edu.br/catalogo/restrito",
    );
    expect(screen.queryByTitle("Leitura: Livro com restrição")).not.toBeInTheDocument();
  });
});
describe("Destinos validados", () => {
  it("não aceita domínios parecidos, chaves de vídeo falsas ou PDF do Drive", () => {
    expect(youtubeId("https://www.youtube.com.evil.example/watch?v=abcdefghijk")).toBeNull();
    expect(youtubeId("https://www.youtube.com/watch?v=abcdefghijk")).toBe("abcdefghijk");
    expect(officialBookUrl("https://drive.google.com/livro.pdf")).toBe(false);
    expect(amazonProduct("https://amazon.com.br.evil.example/dp/8501011665")).toBeNull();
    expect(amazonProduct("https://www.amazon.com.br/O-Livro/dp/8501011665?tag=ignored")).toBe(
      "https://www.amazon.com.br/dp/8501011665",
    );
    expect(new URL(amazonSearch("Equações & áreas", "Autor")).searchParams.get("k")).toBe(
      "Equações & áreas Autor",
    );
    expect(
      videoEmbedUrl({
        ...libraryVideo,
        clip: { start: 777, end: 888, chapterTitle: "Horário inventado" },
      }),
    ).toBeNull();
    expect(
      preparationLibrarySchema.safeParse({
        ...libraryFixture,
        books: [{ ...libraryBook, pdf: { ...libraryBook.pdf!, license: "CC BY-NC" } }],
      }).success,
    ).toBe(false);
  });
});
