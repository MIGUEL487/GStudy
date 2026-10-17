import type {
  LibraryVideo,
  LibraryBook,
  PreparationLibrary,
} from "@/lib/preparation-library-model";
export const libraryVideo: LibraryVideo = {
  id: "abcdefghijk",
  title: "Matemática básica: uma aula completa",
  channel: "Universo Narrado",
  channelUrl: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv",
  avatarUrl: "https://yt3.ggpht.com/test-channel-photo",
  topicIndex: 0,
  reason: "O capítulo de equações ajuda a compreender o assunto antes de praticar.",
  embeddable: true,
  duration: 43200,
  chapters: [
    { title: "Introdução", start: 0, end: 3600 },
    { title: "Equações", start: 3600, end: 7200 },
    { title: "Porcentagem", start: 7200, end: 43200 },
  ],
  clip: { start: 3600, end: 7200, chapterTitle: "Equações" },
};
export const libraryBook: LibraryBook = {
  title: "Matemática Básica Aberta",
  author: "Equipe de Matemática",
  topicIndex: 0,
  reason: "Leia a seção de equações para retomar os fundamentos.",
  access: "open",
  language: "pt-BR",
  officialUrl: "https://biblioteca.exemplo.edu.br/catalogo/matematica",
  pdf: {
    url: "https://biblioteca.exemplo.edu.br/livro.pdf",
    license: "CC BY",
    attribution: "Equipe de Matemática",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    evidenceUrl: "https://biblioteca.exemplo.edu.br/catalogo/matematica",
    checkedAt: "2026-10-16T12:00:00.000Z",
    embeddable: true,
  },
};
export const libraryFixture: PreparationLibrary = {
  version: 1,
  bookSearchVersion: 5,
  checkedAt: "2026-10-16T12:00:00.000Z",
  mode: "youtube-api",
  videos: [libraryVideo],
  books: [
    libraryBook,
    {
      title: "O Homem que Calculava",
      author: "Malba Tahan",
      topicIndex: 1,
      reason: "Exercite o raciocínio com desafios e confira a edição.",
      access: "paid",
      language: "pt",
      amazonUrl: "https://www.amazon.com.br/dp/8501011665",
    },
  ],
};
