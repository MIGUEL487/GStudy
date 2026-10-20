export const students = [
  {
    id: "gui",
    name: "Gui",
    description: "Exemplos do dia a dia",
    color: "#647d6b",
    greeting: (topic: string) =>
      `Oi, prof! Hoje a aula é sobre **${topic}**, né? Pode começar do começo e me dar um exemplo do dia a dia? Se quiser, desenhe na lousa!`,
  },
  {
    id: "lia",
    name: "Lia",
    description: "O porquê de cada ideia",
    color: "#a15d52",
    greeting: (topic: string) =>
      `Oi, sou a Lia! Quero entender **${topic}** de verdade. Você pode me explicar por que isso funciona, com suas próprias palavras?`,
  },
  {
    id: "rafa",
    name: "Rafa",
    description: "Aprender na prática",
    color: "#537895",
    greeting: (topic: string) =>
      `Sou o Rafa! Vamos experimentar? Me ensine **${topic}** mostrando uma situação em que eu poderia usar essa ideia.`,
  },
  {
    id: "maya",
    name: "Maya",
    description: "Desenhos e analogias",
    color: "#947344",
    greeting: (topic: string) =>
      `Oi, eu sou a Maya! Penso melhor com imagens. Como você desenharia ou compararia **${topic}** com algo que a gente já conhece?`,
  },
] as const;

export type StudentId = (typeof students)[number]["id"];
export const studentOf = (id: StudentId) =>
  students.find((student) => student.id === id) ?? students[0];
