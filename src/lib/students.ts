export const students = [
  {
    id: "gui",
    name: "Gui",
    role: "Criança curiosa (8 anos)",
    description: "Criança curiosa (8 anos) · Exemplos lúdicos e simples",
    color: "#647d6b",
    greeting: (topic: string) =>
      `Oi, prof! Eu tenho 8 anos e sou muito curioso. Hoje a aula é sobre **${topic}**, né? Me explica com historinhas ou desenhe na lousa?`,
  },
  {
    id: "lia",
    name: "Lia",
    role: "Colega de classe",
    description: "Colega de classe · Foco no vestibular e macetes",
    color: "#a15d52",
    greeting: (topic: string) =>
      `Oi, sou a Lia! Quero entender **${topic}** de verdade para a prova. Você pode me explicar por que isso funciona, com macetes práticos?`,
  },
  {
    id: "maya",
    name: "Maya",
    role: "Professora sênior exigente",
    description: "Professora sênior exigente · Rigor conceitual e precisão",
    color: "#947344",
    greeting: (topic: string) =>
      `Olá. Sou a professora Maya. Vamos abordar **${topic}**. Explique com rigor conceitual e precisão: comece pelas definições e relações fundamentais.`,
  },
  {
    id: "rafa",
    name: "Rafa",
    role: "Colega de experimentos",
    description: "Colega prático · Aplicação e experimentos",
    color: "#537895",
    greeting: (topic: string) =>
      `Sou o Rafa! Vamos experimentar? Me ensine **${topic}** mostrando uma situação em que eu poderia usar essa ideia na prática.`,
  },
] as const;

export type StudentId = (typeof students)[number]["id"];
export const studentOf = (id: StudentId) =>
  students.find((student) => student.id === id) ?? students[0];
