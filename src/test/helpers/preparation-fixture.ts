import type { PreparationGuide } from "@/lib/preparation-model";
export const preparationGuide: PreparationGuide = {
  headline: "Geometria com estratégia, uma sessão por vez.",
  approach:
    "Comece pelas áreas, investigue os ângulos e resolva problemas antes de revisar seus erros.",
  rhythm:
    "Reserve trinta minutos por dia. Alterne estudo e resolução, retomando os erros na sessão seguinte.",
  missions: [
    {
      title: "Assista e desenhe as áreas",
      topicIndex: 0,
      kind: "watch",
      minutes: 20,
      instructions: "Procure uma aula de áreas e desenhe dois exemplos no caderno.",
      deliverable: "Dois exemplos com unidades e justificativa.",
    },
    {
      title: "Leia e conecte os ângulos",
      topicIndex: 1,
      kind: "read",
      minutes: 25,
      instructions: "Leia uma seção sobre ângulos e explique uma propriedade com suas palavras.",
      deliverable: "Uma propriedade explicada com um desenho.",
    },
    {
      title: "Investigue três problemas",
      topicIndex: 2,
      kind: "solve",
      minutes: 30,
      instructions: "Resolva três problemas do material oficial e registre as tentativas.",
      deliverable: "Três resoluções com o caminho que você tentou.",
    },
    {
      title: "Revise os erros de áreas",
      topicIndex: 0,
      kind: "review",
      minutes: 15,
      instructions: "Refaça um problema de área que causou dificuldade, sem olhar a resolução.",
      deliverable: "Um erro explicado e uma nova resolução.",
    },
  ],
  resources: [
    {
      kind: "video",
      title: "Áreas de figuras planas",
      creator: "Khan Academy Brasil",
      reason: "Use os exemplos para comparar áreas antes de resolver os problemas.",
      topicIndex: 0,
      sourceIndex: null,
    },
    {
      kind: "book",
      title: "O Homem que Calculava",
      creator: "Malba Tahan",
      reason: "Leia um desafio e registre as hipóteses para exercitar o raciocínio.",
      topicIndex: 2,
      sourceIndex: null,
    },
  ],
};
