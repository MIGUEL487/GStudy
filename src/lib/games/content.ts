import type { GameDefinition, GameQuestion } from "./types";

export const COUNTRIES = [
  ["BRA", "Brasil", "Brasília", "🇧🇷"],
  ["ARG", "Argentina", "Buenos Aires", "🇦🇷"],
  ["CAN", "Canadá", "Ottawa", "🇨🇦"],
  ["USA", "Estados Unidos", "Washington, D.C.", "🇺🇸"],
  ["MEX", "México", "Cidade do México", "🇲🇽"],
  ["FRA", "França", "Paris", "🇫🇷"],
  ["ESP", "Espanha", "Madri", "🇪🇸"],
  ["ITA", "Itália", "Roma", "🇮🇹"],
  ["CHN", "China", "Pequim", "🇨🇳"],
  ["JPN", "Japão", "Tóquio", "🇯🇵"],
  ["IND", "Índia", "Nova Délhi", "🇮🇳"],
  ["AUS", "Austrália", "Camberra", "🇦🇺"],
  ["EGY", "Egito", "Cairo", "🇪🇬"],
  ["ZAF", "África do Sul", "Pretória (Executivo)", "🇿🇦"],
  ["DZA", "Argélia", "Argel", "🇩🇿"],
  ["SWE", "Suécia", "Estocolmo", "🇸🇪"],
] as const;
export function levels(questions: GameQuestion[]): GameDefinition["questions"] {
  return {
    facil: questions.slice(0, Math.max(3, Math.ceil(questions.length / 2))),
    medio: questions.slice(0, Math.max(3, Math.ceil(questions.length * 0.75))),
    dificil: questions,
  };
}
function definition(
  id: string,
  title: string,
  subject: GameDefinition["subject"],
  type: GameDefinition["type"],
  rules: string,
  questions: GameQuestion[],
  timeLimitSeconds?: number,
): GameDefinition {
  return {
    id,
    title,
    subject,
    type,
    rules,
    description: rules,
    iconName: "Sparkles",
    estimatedMinutes: 2,
    questions: levels(questions),
    ...(timeLimitSeconds ? { timeLimitSeconds } : {}),
  };
}
const states = [
  ["Acre", "Rio Branco"],
  ["Alagoas", "Maceió"],
  ["Amapá", "Macapá"],
  ["Amazonas", "Manaus"],
  ["Bahia", "Salvador"],
  ["Ceará", "Fortaleza"],
  ["Distrito Federal", "Brasília"],
  ["Espírito Santo", "Vitória"],
  ["Goiás", "Goiânia"],
  ["Maranhão", "São Luís"],
  ["Mato Grosso", "Cuiabá"],
  ["Mato Grosso do Sul", "Campo Grande"],
  ["Minas Gerais", "Belo Horizonte"],
  ["Pará", "Belém"],
  ["Paraíba", "João Pessoa"],
  ["Paraná", "Curitiba"],
  ["Pernambuco", "Recife"],
  ["Piauí", "Teresina"],
  ["Rio de Janeiro", "Rio de Janeiro"],
  ["Rio Grande do Norte", "Natal"],
  ["Rio Grande do Sul", "Porto Alegre"],
  ["Rondônia", "Porto Velho"],
  ["Roraima", "Boa Vista"],
  ["Santa Catarina", "Florianópolis"],
  ["São Paulo", "São Paulo"],
  ["Sergipe", "Aracaju"],
  ["Tocantins", "Palmas"],
] as const;
const vocabulary = [
  "ecossistema",
  "fotossíntese",
  "hipótese",
  "metáfora",
  "cidadania",
  "oxigênio",
  "átomo",
  "geografia",
  "pesquisa",
  "história",
  "ciência",
  "equação",
];
const vocabularyHints: Record<string, string> = {
  ecossistema: "Seres vivos e condições físicas que interagem num ambiente.",
  fotossíntese:
    "Processo que usa luz para produzir matéria orgânica a partir de água e gás carbônico.",
  hipótese: "Explicação provisória que pode ser testada numa pesquisa.",
  metáfora: "Figura de linguagem que aproxima ideias sem usar uma comparação explícita.",
  cidadania: "Exercício de direitos e deveres na vida em sociedade.",
  oxigênio: "Elemento químico de símbolo O, usado na respiração aeróbia.",
  átomo: "Unidade de um elemento químico que possui núcleo e elétrons.",
  geografia: "Área que estuda o espaço e as relações entre sociedade e natureza.",
  pesquisa: "Investigação organizada para responder a uma pergunta.",
  história: "Área que estuda as experiências humanas ao longo do tempo.",
  ciência: "Produção de conhecimento apoiada em evidências e métodos de investigação.",
  equação: "Igualdade matemática que contém uma ou mais incógnitas.",
};
const units = [
  ["força", "newton"],
  ["energia", "joule"],
  ["potência", "watt"],
  ["pressão", "pascal"],
  ["frequência", "hertz"],
  ["carga elétrica", "coulomb"],
] as const;
const english = [
  ["water", "água"],
  ["book", "livro"],
  ["sun", "sol"],
  ["tree", "árvore"],
  ["school", "escola"],
  ["friend", "amigo"],
  ["time", "tempo"],
  ["world", "mundo"],
  ["learn", "aprender"],
  ["write", "escrever"],
  ["read", "ler"],
  ["think", "pensar"],
] as const;
const timelines = [
  [
    "Brasil: da Colônia à República",
    [
      "Chegada da expedição de Cabral (1500)",
      "Independência (1822)",
      "Abolição da escravidão (1888)",
      "Proclamação da República (1889)",
    ],
  ],
  [
    "Transformações da Europa",
    [
      "Queda de Constantinopla (1453)",
      "Início da Reforma Protestante (1517)",
      "Revolução Francesa (1789)",
      "Unificação alemã (1871)",
    ],
  ],
  [
    "O século XX",
    [
      "Início da Primeira Guerra (1914)",
      "Crise de 1929",
      "Fim da Segunda Guerra (1945)",
      "Queda do Muro de Berlim (1989)",
    ],
  ],
  [
    "Ciência e exploração",
    [
      "Publicação dos Principia de Newton (1687)",
      "Publicação de A origem das espécies (1859)",
      "Primeiro voo espacial tripulado (1961)",
      "Primeira chegada humana à Lua (1969)",
    ],
  ],
] as const;
export const EXTRA_GAMES: GameDefinition[] = [
  definition(
    "math-primos",
    "Fatores e primos",
    "matematica",
    "drag-classify",
    "Classifique cada número como primo ou composto. Toque num número e depois numa categoria; no computador, você também pode arrastar.",
    [0, 1, 2, 3].map((n) => ({
      id: `prime-${n}`,
      prompt: "Separe primos de compostos",
      categories: ["Primo", "Composto"],
      items: [2 + n * 10, 3 + n * 10, 4 + n * 10, 5 + n * 10, 6 + n * 10].map((value) => ({
        label: String(value),
        category: Array.from({ length: Math.floor(Math.sqrt(value)) - 1 }, (_, i) => i + 2).some(
          (d) => value % d === 0,
        )
          ? "Composto"
          : "Primo",
      })),
    })),
  ),
  definition(
    "geo-estados",
    "Estados do Brasil",
    "geografia",
    "multiple-choice",
    "Identifique a capital de cada unidade federativa. Cada acerto mantém o combo.",
    states.map(([state, capital], i) => ({
      id: `state-${i}`,
      prompt: `Qual é a capital de ${state}?`,
      options: [
        capital,
        ...states
          .filter((s) => s[1] !== capital)
          .slice(i % 10, (i % 10) + 3)
          .map((s) => s[1]),
      ],
      correctIndex: 0,
      explanation: `${capital} é a capital de ${state}.`,
    })),
  ),
  definition(
    "port-forca",
    "Forca de vocabulário",
    "portugues",
    "word-hangman",
    "Descubra a palavra com até seis letras erradas. Acentos aparecem automaticamente. Use as letras na tela ou o teclado.",
    vocabulary.map((word, i) => ({
      id: `word-${i}`,
      prompt: vocabularyHints[word]!,
      correctAnswer: word,
    })),
  ),
  definition(
    "bio-organelas",
    "Organelas e classificação",
    "biologia",
    "drag-classify",
    "Relacione cada estrutura celular à sua função. Toque ou arraste para classificar.",
    [
      {
        id: "cell-0",
        prompt: "Que função cada estrutura realiza?",
        categories: [
          "Síntese de proteínas",
          "Produção de ATP",
          "Armazenamento do DNA",
          "Digestão celular",
        ],
        items: [
          { label: "Ribossomo", category: "Síntese de proteínas" },
          { label: "Mitocôndria", category: "Produção de ATP" },
          { label: "Núcleo", category: "Armazenamento do DNA" },
          { label: "Lisossomo", category: "Digestão celular" },
        ],
      },
      {
        id: "cell-1",
        prompt: "Compare células animais e vegetais",
        categories: ["Típico de célula vegetal", "Presente em ambas"],
        items: [
          { label: "Parede celular de celulose", category: "Típico de célula vegetal" },
          { label: "Cloroplasto", category: "Típico de célula vegetal" },
          { label: "Membrana plasmática", category: "Presente em ambas" },
          { label: "Mitocôndria", category: "Presente em ambas" },
        ],
      },
      {
        id: "cell-2",
        prompt: "Classifique tipos de célula",
        categories: ["Procarionte", "Eucarionte"],
        items: [
          { label: "Bactéria", category: "Procarionte" },
          { label: "Célula de um fungo", category: "Eucarionte" },
          { label: "Núcleo delimitado por membrana", category: "Eucarionte" },
          { label: "Ausência de núcleo delimitado", category: "Procarionte" },
        ],
      },
    ],
  ),
  definition(
    "history-timeline",
    "Linha do tempo",
    "historia",
    "sequence-order",
    "Organize os acontecimentos do mais antigo ao mais recente. Use as setas, o teclado ou arraste os cartões.",
    timelines.map(([prompt, sequence], i) => ({
      id: `timeline-${i}`,
      prompt,
      sequence: [...sequence],
    })),
  ),
  definition(
    "physics-units",
    "Unidades em movimento",
    "fisica",
    "typing-fast",
    "Digite o nome da unidade do SI pedida antes do tempo acabar. Acentos e maiúsculas não alteram sua resposta.",
    units.map(([quantity, unit], i) => ({
      id: `unit-${i}`,
      prompt: `Qual é o nome da unidade de ${quantity} no SI?`,
      correctAnswer: unit,
      explanation: `A unidade de ${quantity} no SI é ${unit}.`,
    })),
    60,
  ),
  definition(
    "english-pairs",
    "Pares de vocabulário",
    "ingles",
    "memory-pairs",
    "Vire duas cartas para formar um par de tradução. A posição muda por semente e permanece igual num desafio entre amigos.",
    [0, 1, 2].map((i) => ({
      id: `english-${i}`,
      prompt: "Encontre os pares em inglês e português",
      pairs: english.slice(i * 4, i * 4 + 4).map(([left, right]) => ({ left, right })),
    })),
  ),
];

export const MAP_GAME = definition(
  "geo-mapa-mundi",
  "Mapa-múndi Interativo",
  "geografia",
  "map-click",
  "Encontre o país no mapa. Use o zoom para regiões menores. Com teclado, navegue pelos países e pressione Enter para responder.",
  COUNTRIES.map(([id, country, capital]) => ({
    id: `map-${id}`,
    prompt: `Encontre ${country} no mapa`,
    targetKey: id,
    correctAnswer: country,
    explanation: `${country} tem como capital ${capital}.`,
  })),
);
export const FLAGS_GAME = definition(
  "geo-bandeiras",
  "Bandeiras do Mundo",
  "geografia",
  "memory-pairs",
  "Encontre os pares entre bandeiras e países. Vire duas cartas por vez; cada tentativa errada desfaz o combo.",
  [0, 1, 2, 3].map((i) => ({
    id: `flags-${i}`,
    prompt: "Que país corresponde a cada bandeira?",
    pairs: COUNTRIES.slice(i * 4, i * 4 + 4).map(([, country, , flag]) => ({
      left: flag,
      right: country,
    })),
  })),
);
