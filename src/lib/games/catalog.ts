import type { GameDefinition } from "./types";
import { EXTRA_GAMES, FLAGS_GAME, MAP_GAME } from "./content";

const LEGACY_GAMES: GameDefinition[] = [
  // MATEMÁTICA
  {
    id: "math-calc-mental",
    title: "Relâmpago de Cálculo Mental",
    subject: "matematica",
    type: "time-survival",
    description: "Resolva o máximo de operações matemáticas antes do cronômetro zerar.",
    rules:
      "Você começa com 45 segundos. Cada acerto rende 100 pontos multiplicados pelo seu combo (+1s de bônus). Erros quebram o combo e subtraem 2 segundos.",
    iconName: "Zap",
    estimatedMinutes: 2,
    timeLimitSeconds: 45,
    questions: {
      facil: [
        { id: "cm-f1", prompt: "15 + 28 = ?", options: ["43", "41", "45", "33"], correctIndex: 0 },
        { id: "cm-f2", prompt: "50 - 24 = ?", options: ["24", "26", "36", "28"], correctIndex: 1 },
        { id: "cm-f3", prompt: "7 × 8 = ?", options: ["54", "58", "56", "64"], correctIndex: 2 },
        { id: "cm-f4", prompt: "81 ÷ 9 = ?", options: ["7", "8", "9", "11"], correctIndex: 2 },
        { id: "cm-f5", prompt: "12 × 4 = ?", options: ["48", "44", "52", "36"], correctIndex: 0 },
        { id: "cm-f6", prompt: "64 ÷ 8 = ?", options: ["6", "7", "8", "9"], correctIndex: 2 },
        { id: "cm-f7", prompt: "35 + 47 = ?", options: ["82", "72", "84", "92"], correctIndex: 0 },
        { id: "cm-f8", prompt: "100 - 37 = ?", options: ["63", "53", "73", "67"], correctIndex: 0 },
      ],
      medio: [
        { id: "cm-m1", prompt: "14 × 6 = ?", options: ["84", "74", "94", "88"], correctIndex: 0 },
        { id: "cm-m2", prompt: "125 ÷ 5 = ?", options: ["20", "25", "30", "15"], correctIndex: 1 },
        {
          id: "cm-m3",
          prompt: "18 + 27 + 15 = ?",
          options: ["60", "58", "62", "50"],
          correctIndex: 0,
        },
        { id: "cm-m4", prompt: "72 - 39 = ?", options: ["31", "33", "43", "35"], correctIndex: 1 },
        { id: "cm-m5", prompt: "16 × 5 = ?", options: ["80", "70", "85", "90"], correctIndex: 0 },
        { id: "cm-m6", prompt: "144 ÷ 12 = ?", options: ["11", "12", "14", "13"], correctIndex: 1 },
        {
          id: "cm-m7",
          prompt: "250 - 135 = ?",
          options: ["125", "115", "105", "110"],
          correctIndex: 1,
        },
        {
          id: "cm-m8",
          prompt: "15 × 15 = ?",
          options: ["225", "215", "235", "245"],
          correctIndex: 0,
        },
      ],
      dificil: [
        {
          id: "cm-d1",
          prompt: "23 × 11 = ?",
          options: ["243", "253", "263", "251"],
          correctIndex: 1,
        },
        { id: "cm-d2", prompt: "256 ÷ 16 = ?", options: ["14", "16", "18", "12"], correctIndex: 1 },
        {
          id: "cm-d3",
          prompt: "18 × 12 = ?",
          options: ["216", "206", "226", "196"],
          correctIndex: 0,
        },
        {
          id: "cm-d4",
          prompt: "500 - 287 = ?",
          options: ["213", "223", "203", "313"],
          correctIndex: 0,
        },
        {
          id: "cm-d5",
          prompt: "17 × 7 = ?",
          options: ["119", "129", "109", "117"],
          correctIndex: 0,
        },
        { id: "cm-d6", prompt: "324 ÷ 18 = ?", options: ["18", "16", "19", "17"], correctIndex: 0 },
        {
          id: "cm-d7",
          prompt: "45 × 8 = ?",
          options: ["360", "350", "370", "340"],
          correctIndex: 0,
        },
        {
          id: "cm-d8",
          prompt: "75% de 240 = ?",
          options: ["160", "180", "190", "175"],
          correctIndex: 1,
        },
      ],
    },
  },
  {
    id: "math-tabuada",
    title: "Sobrevivência das Tabuadas",
    subject: "matematica",
    type: "time-survival",
    description: "Responda às tabuadas fundamentais com precisão e velocidade.",
    rules:
      "A tabuada é a base do raciocínio quantitativo. Acerte sem pestanejar para acumular multiplicadores de combo e bater o recorde.",
    iconName: "Flame",
    estimatedMinutes: 2,
    timeLimitSeconds: 40,
    questions: {
      facil: [
        { id: "tb-f1", prompt: "6 × 7 = ?", options: ["42", "40", "48", "36"], correctIndex: 0 },
        { id: "tb-f2", prompt: "8 × 8 = ?", options: ["62", "64", "56", "72"], correctIndex: 1 },
        { id: "tb-f3", prompt: "9 × 6 = ?", options: ["52", "54", "56", "63"], correctIndex: 1 },
        { id: "tb-f4", prompt: "7 × 4 = ?", options: ["26", "28", "32", "24"], correctIndex: 1 },
        { id: "tb-f5", prompt: "5 × 9 = ?", options: ["45", "40", "50", "35"], correctIndex: 0 },
        { id: "tb-f6", prompt: "4 × 8 = ?", options: ["32", "28", "36", "24"], correctIndex: 0 },
      ],
      medio: [
        { id: "tb-m1", prompt: "7 × 9 = ?", options: ["63", "61", "54", "72"], correctIndex: 0 },
        { id: "tb-m2", prompt: "8 × 9 = ?", options: ["71", "72", "68", "74"], correctIndex: 1 },
        { id: "tb-m3", prompt: "6 × 8 = ?", options: ["46", "48", "52", "44"], correctIndex: 1 },
        { id: "tb-m4", prompt: "12 × 7 = ?", options: ["84", "74", "94", "82"], correctIndex: 0 },
        { id: "tb-m5", prompt: "9 × 9 = ?", options: ["81", "89", "79", "83"], correctIndex: 0 },
        { id: "tb-m6", prompt: "8 × 7 = ?", options: ["56", "54", "58", "62"], correctIndex: 0 },
      ],
      dificil: [
        { id: "tb-d1", prompt: "13 × 6 = ?", options: ["78", "68", "88", "76"], correctIndex: 0 },
        { id: "tb-d2", prompt: "14 × 7 = ?", options: ["96", "98", "94", "102"], correctIndex: 1 },
        {
          id: "tb-d3",
          prompt: "12 × 9 = ?",
          options: ["108", "118", "98", "106"],
          correctIndex: 0,
        },
        {
          id: "tb-d4",
          prompt: "15 × 8 = ?",
          options: ["110", "120", "125", "115"],
          correctIndex: 1,
        },
        { id: "tb-d5", prompt: "16 × 6 = ?", options: ["96", "86", "106", "92"], correctIndex: 0 },
        { id: "tb-d6", prompt: "19 × 4 = ?", options: ["76", "74", "78", "86"], correctIndex: 0 },
      ],
    },
  },
  {
    id: "math-balanca",
    title: "Balança de Equações",
    subject: "matematica",
    type: "multiple-choice",
    description: "Descubra a incógnita x que equilibra a balança algébrica.",
    rules:
      "Toda equação é uma balança de dois pratos em equilíbrio. Isole o x mentalmente e selecione a resposta exata.",
    iconName: "Scale",
    estimatedMinutes: 3,
    questions: {
      facil: [
        {
          id: "bl-f1",
          prompt: "x + 7 = 19  ➔  Qual o valor de x?",
          options: ["12", "11", "13", "14"],
          correctIndex: 0,
        },
        {
          id: "bl-f2",
          prompt: "2x = 16  ➔  Qual o valor de x?",
          options: ["6", "8", "9", "7"],
          correctIndex: 1,
        },
        {
          id: "bl-f3",
          prompt: "x - 5 = 14  ➔  Qual o valor de x?",
          options: ["19", "18", "21", "17"],
          correctIndex: 0,
        },
        {
          id: "bl-f4",
          prompt: "3x = 27  ➔  Qual o valor de x?",
          options: ["8", "9", "7", "11"],
          correctIndex: 1,
        },
        {
          id: "bl-f5",
          prompt: "x + 12 = 30  ➔  Qual o valor de x?",
          options: ["18", "16", "22", "17"],
          correctIndex: 0,
        },
      ],
      medio: [
        {
          id: "bl-m1",
          prompt: "2x + 4 = 18  ➔  Qual o valor de x?",
          options: ["7", "6", "8", "9"],
          correctIndex: 0,
        },
        {
          id: "bl-m2",
          prompt: "3x - 5 = 16  ➔  Qual o valor de x?",
          options: ["6", "7", "8", "5"],
          correctIndex: 1,
        },
        {
          id: "bl-m3",
          prompt: "4x + 8 = 32  ➔  Qual o valor de x?",
          options: ["6", "5", "7", "8"],
          correctIndex: 0,
        },
        {
          id: "bl-m4",
          prompt: "5x - 10 = 25  ➔  Qual o valor de x?",
          options: ["6", "7", "8", "9"],
          correctIndex: 1,
        },
        {
          id: "bl-m5",
          prompt: "2x + 15 = 35  ➔  Qual o valor de x?",
          options: ["10", "12", "8", "15"],
          correctIndex: 0,
        },
      ],
      dificil: [
        {
          id: "bl-d1",
          prompt: "3x + 12 = x + 24  ➔  Qual o valor de x?",
          options: ["6", "5", "7", "8"],
          correctIndex: 0,
        },
        {
          id: "bl-d2",
          prompt: "5x - 8 = 2x + 13  ➔  Qual o valor de x?",
          options: ["6", "7", "8", "5"],
          correctIndex: 1,
        },
        {
          id: "bl-d3",
          prompt: "4(x - 2) = 24  ➔  Qual o valor de x?",
          options: ["7", "8", "6", "9"],
          correctIndex: 1,
        },
        {
          id: "bl-d4",
          prompt: "2(3x + 1) = 26  ➔  Qual o valor de x?",
          options: ["4", "5", "3", "6"],
          correctIndex: 0,
        },
        {
          id: "bl-d5",
          prompt: "7x - 14 = 3x + 18  ➔  Qual o valor de x?",
          options: ["8", "7", "9", "6"],
          correctIndex: 0,
        },
      ],
    },
  },

  // GEOGRAFIA
  {
    id: "geo-mapa-mundi",
    title: "Mapa-múndi Interativo",
    subject: "geografia",
    type: "map-click",
    description: "Identifique os continentes e grandes regiões no mapa interativo.",
    rules:
      "Observe o mapa-múndi e clique na região destacada ou correspondente ao continente solicitado na pergunta.",
    iconName: "Globe",
    estimatedMinutes: 2,
    questions: {
      facil: [
        {
          id: "mp-f1",
          prompt: "Onde se localiza a América do Sul?",
          targetKey: "america-sul",
          options: ["América do Sul", "América do Norte", "Europa", "África"],
          correctIndex: 0,
        },
        {
          id: "mp-f2",
          prompt: "Onde se localiza o continente Africano?",
          targetKey: "africa",
          options: ["África", "Ásia", "Oceania", "Europa"],
          correctIndex: 0,
        },
        {
          id: "mp-f3",
          prompt: "Onde se localiza a Europa?",
          targetKey: "europa",
          options: ["Europa", "América do Norte", "Ásia", "América do Sul"],
          correctIndex: 0,
        },
        {
          id: "mp-f4",
          prompt: "Onde se localiza a Ásia?",
          targetKey: "asia",
          options: ["Ásia", "Oceania", "África", "Europa"],
          correctIndex: 0,
        },
        {
          id: "mp-f5",
          prompt: "Onde se localiza a Oceania?",
          targetKey: "oceania",
          options: ["Oceania", "América do Sul", "Ásia", "Europa"],
          correctIndex: 0,
        },
      ],
      medio: [
        {
          id: "mp-m1",
          prompt: "Em qual continente fica o Brasil e a Floresta Amazônica?",
          targetKey: "america-sul",
          options: ["América do Sul", "África", "América do Norte", "Ásia"],
          correctIndex: 0,
        },
        {
          id: "mp-m2",
          prompt: "Em qual continente fica o Deserto do Saara?",
          targetKey: "africa",
          options: ["Ásia", "África", "Oceania", "América do Sul"],
          correctIndex: 1,
        },
        {
          id: "mp-m3",
          prompt: "Em qual continente fica o Japão e a Cordilheira do Himalaia?",
          targetKey: "asia",
          options: ["Ásia", "Europa", "Oceania", "América do Norte"],
          correctIndex: 0,
        },
        {
          id: "mp-m4",
          prompt: "Em qual continente fica a Austrália?",
          targetKey: "oceania",
          options: ["Ásia", "América do Norte", "Oceania", "África"],
          correctIndex: 2,
        },
      ],
      dificil: [
        {
          id: "mp-d1",
          prompt: "Qual continente tem a maior área territorial do planeta?",
          targetKey: "asia",
          options: ["África", "Ásia", "América do Norte", "Europa"],
          correctIndex: 1,
        },
        {
          id: "mp-d2",
          prompt:
            "Qual continente é banhado tanto pelo Oceano Atlântico quanto pelo Índico ao sul?",
          targetKey: "africa",
          options: ["África", "Oceania", "América do Sul", "Europa"],
          correctIndex: 0,
        },
        {
          id: "mp-d3",
          prompt:
            "O Canal do Panamá liga o Oceano Atlântico ao Pacífico entre quais massas continentais?",
          targetKey: "america-sul",
          options: ["Américas (Norte e Sul)", "Europa e África", "Ásia e Oceania", "África e Ásia"],
          correctIndex: 0,
        },
      ],
    },
  },
  {
    id: "geo-capitais",
    title: "Quiz de Capitais",
    subject: "geografia",
    type: "multiple-choice",
    description: "Teste seus conhecimentos sobre as capitais do Brasil e do Mundo.",
    rules:
      "Descubra se você realmente conhece as capitais dos estados e dos países mais importantes.",
    iconName: "Compass",
    estimatedMinutes: 2,
    questions: {
      facil: [
        {
          id: "cp-f1",
          prompt: "Qual é a capital do Brasil?",
          options: ["Brasília", "Rio de Janeiro", "São Paulo", "Salvador"],
          correctIndex: 0,
        },
        {
          id: "cp-f2",
          prompt: "Qual é a capital da Argentina?",
          options: ["Córdoba", "Rosário", "Buenos Aires", "Montevidéu"],
          correctIndex: 2,
        },
        {
          id: "cp-f3",
          prompt: "Qual é a capital da França?",
          options: ["Lyon", "Marselha", "Paris", "Nice"],
          correctIndex: 2,
        },
        {
          id: "cp-f4",
          prompt: "Qual é a capital do Japão?",
          options: ["Tóquio", "Quioto", "Osaka", "Nagoya"],
          correctIndex: 0,
        },
        {
          id: "cp-f5",
          prompt: "Qual é a capital de Minas Gerais?",
          options: ["Uberlândia", "Belo Horizonte", "Ouro Preto", "Juiz de Fora"],
          correctIndex: 1,
        },
      ],
      medio: [
        {
          id: "cp-m1",
          prompt: "Qual é a capital da Austrália?",
          options: ["Sydney", "Melbourne", "Canberra", "Brisbane"],
          correctIndex: 2,
        },
        {
          id: "cp-m2",
          prompt: "Qual é a capital do Canadá?",
          options: ["Toronto", "Vancouver", "Ottawa", "Montreal"],
          correctIndex: 2,
        },
        {
          id: "cp-m3",
          prompt: "Qual é a capital do Pará?",
          options: ["Santarém", "Belém", "Macapá", "Manaus"],
          correctIndex: 1,
        },
        {
          id: "cp-m4",
          prompt: "Qual é a capital da Alemanha?",
          options: ["Munique", "Berlim", "Frankfurt", "Hamburgo"],
          correctIndex: 1,
        },
        {
          id: "cp-m5",
          prompt: "Qual é a capital de Goiás?",
          options: ["Anápolis", "Goiânia", "Rio Verde", "Caldas Novas"],
          correctIndex: 1,
        },
      ],
      dificil: [
        {
          id: "cp-d1",
          prompt: "Qual é a capital do Marrocos?",
          options: ["Casablanca", "Marrakech", "Rabat", "Fez"],
          correctIndex: 2,
        },
        {
          id: "cp-d2",
          prompt: "Qual é a capital da Nova Zelândia?",
          options: ["Auckland", "Wellington", "Christchurch", "Hamilton"],
          correctIndex: 1,
        },
        {
          id: "cp-d3",
          prompt: "Qual é a capital de Sergipe?",
          options: ["Aracaju", "Maceió", "Lagarto", "Itabaiana"],
          correctIndex: 0,
        },
        {
          id: "cp-d4",
          prompt: "Qual é a capital da Turquia?",
          options: ["Istambul", "Ancara", "Izmir", "Bursa"],
          correctIndex: 1,
        },
        {
          id: "cp-d5",
          prompt: "Qual é a capital do Tocantins?",
          options: ["Araguaína", "Palmas", "Gurupi", "Porto Nacional"],
          correctIndex: 1,
        },
      ],
    },
  },
  {
    id: "geo-bandeiras",
    title: "Bandeiras do Mundo",
    subject: "geografia",
    type: "multiple-choice",
    description: "Identifique as nações a partir de suas bandeiras e símbolos.",
    rules:
      "Cores, formas e símbolos contam a história das civilizações. Descubra a que país cada bandeira pertence.",
    iconName: "Flag",
    estimatedMinutes: 2,
    questions: {
      facil: [
        {
          id: "bd-f1",
          prompt:
            "🟢🟡🔵⚪ De qual país é esta bandeira verde e amarela com losango e esfera azul?",
          options: ["Brasil", "Colômbia", "Argentina", "Portugal"],
          correctIndex: 0,
        },
        {
          id: "bd-f2",
          prompt:
            "🔵⚪🔴 Qual país tem faixas verticais azul, branca e vermelha (liberté, égalité, fraternité)?",
          options: ["Itália", "França", "Holanda", "Reino Unido"],
          correctIndex: 1,
        },
        {
          id: "bd-f3",
          prompt:
            "⚪🔴 Qual país tem fundo branco com um círculo vermelho no centro representando o sol nascente?",
          options: ["China", "Coreia do Sul", "Japão", "Vietnã"],
          correctIndex: 2,
        },
        {
          id: "bd-f4",
          prompt: "🟢⚪🔴 Qual país tem faixas verticais verde, branca e vermelha?",
          options: ["Itália", "México", "Espanha", "Irlanda"],
          correctIndex: 0,
        },
      ],
      medio: [
        {
          id: "bd-m1",
          prompt:
            "🔴🟡🔴 Qual país europeu tem faixas horizontais vermelhas com amarelo no centro e seu brasão real?",
          options: ["Portugal", "Espanha", "Bélgica", "Alemanha"],
          correctIndex: 1,
        },
        {
          id: "bd-m2",
          prompt: "⚫🔴🟡 Qual país tem faixas horizontais preta, vermelha e dourada?",
          options: ["Alemanha", "Bélgica", "Áustria", "Polônia"],
          correctIndex: 0,
        },
        {
          id: "bd-m3",
          prompt: "⚪🔴⚪ Qual país tem uma folha de bordo (maple leaf) vermelha no centro?",
          options: ["Estados Unidos", "Canadá", "Suíça", "Noruega"],
          correctIndex: 1,
        },
        {
          id: "bd-m4",
          prompt:
            "🔵⚪🔵 Qual país sul-americano tem faixas horizontais azul-celeste e branco com o Sol de Maio?",
          options: ["Uruguai", "Argentina", "Chile", "Paraguai"],
          correctIndex: 1,
        },
      ],
      dificil: [
        {
          id: "bd-d1",
          prompt:
            "🔴⚪ Qual país nórdico tem a bandeira mais antiga contínua, uma cruz branca sobre fundo vermelho (Dannebrog)?",
          options: ["Suécia", "Noruega", "Dinamarca", "Finlândia"],
          correctIndex: 2,
        },
        {
          id: "bd-d2",
          prompt: "🔵🟡 Qual país nórdico tem uma cruz amarela sobre fundo azul?",
          options: ["Finlândia", "Suécia", "Islândia", "Noruega"],
          correctIndex: 1,
        },
        {
          id: "bd-d3",
          prompt: "🔴⚪ Qual país tem uma cruz branca central sobre fundo vermelho quadrado?",
          options: ["Suíça", "Dinamarca", "Áustria", "Inglaterra"],
          correctIndex: 0,
        },
      ],
    },
  },

  // PORTUGUÊS
  {
    id: "port-certo-errado",
    title: "Certo ou Errado Ortográfico",
    subject: "portugues",
    type: "multiple-choice",
    description: "Identifique rapidamente deslizes e pegadinhas clássicas da língua.",
    rules:
      "Diga se a grafia ou o uso do termo na frase está CERTO ou ERRADO de acordo com a norma culta.",
    iconName: "CheckCheck",
    estimatedMinutes: 2,
    questions: {
      facil: [
        {
          id: "or-f1",
          prompt: "A palavra 'excessão' está com a grafia correta?",
          options: ["Errado (o correto é 'exceção')", "Certo"],
          correctIndex: 0,
          explanation: "'Exceção' se escreve com c e ç.",
        },
        {
          id: "or-f2",
          prompt: "'Espero que eles viajem com segurança.' O verbo 'viajem' com J está correto?",
          options: ["Certo (forma do verbo viajar)", "Errado (deveria ser viagem)"],
          correctIndex: 0,
          explanation: "Verbo é com J ('que eles viajem'); substantivo é com G ('a viagem').",
        },
        {
          id: "or-f3",
          prompt: "A palavra 'enxergar' se escreve com X?",
          options: ["Certo", "Errado (é com CH)"],
          correctIndex: 0,
          explanation: "Após a sílaba inicial 'en-', grafa-se com X.",
        },
        {
          id: "or-f4",
          prompt: "A palavra 'ancioso' está grafada corretamente?",
          options: ["Errado (o correto é 'ansioso')", "Certo"],
          correctIndex: 0,
          explanation: "'Ansioso' deriva de 'ânsia', com S.",
        },
      ],
      medio: [
        {
          id: "or-m1",
          prompt: "'Fomos ao cinema na sessão das 20h.' O uso de 'sessão' está correto?",
          options: [
            "Certo (espaço de tempo/reunião)",
            "Errado (deveria ser seção)",
            "Errado (deveria ser cessão)",
          ],
          correctIndex: 0,
          explanation:
            "Sessão com SS indica intervalo de tempo; seção é divisão; cessão é o ato de ceder.",
        },
        {
          id: "or-m2",
          prompt: "'Não fui trabalhar porque estava doente.' O uso de 'porque' junto está correto?",
          options: [
            "Certo (conjunção explicativa/causal)",
            "Errado (deveria ser por que)",
            "Errado (deveria ser por quê)",
          ],
          correctIndex: 0,
          explanation: "'Porque' junto e sem acento é resposta ou explicação.",
        },
        {
          id: "or-m3",
          prompt: "A palavra 'previlégio' está escrita corretamente?",
          options: ["Errado (o correto é 'privilégio')", "Certo"],
          correctIndex: 0,
          explanation: "Escreve-se 'privilégio' com i.",
        },
        {
          id: "or-m4",
          prompt: "A palavra 'paralizar' com Z está correta?",
          options: ["Errado (o correto é 'paralisar')", "Certo"],
          correctIndex: 0,
          explanation: "Vem de 'paralisia' (com S), portanto 'paralisar'.",
        },
      ],
      dificil: [
        {
          id: "or-d1",
          prompt: "'Ele não explicou o porquê de sua decisão.' O uso de 'porquê' está correto?",
          options: [
            "Certo (substantivado com artigo)",
            "Errado (deveria ser separado)",
            "Errado (sem acento)",
          ],
          correctIndex: 0,
          explanation: "Com artigo 'o porquê', vira substantivo e tem acento circunflexo.",
        },
        {
          id: "or-d2",
          prompt:
            "A palavra 'beneficente' é frequentemente dita como 'beneficiente'. Qual a forma padrão?",
          options: ["Beneficente (sem o 'i')", "Beneficiente"],
          correctIndex: 0,
          explanation: "A forma culta padrão é 'beneficente'.",
        },
        {
          id: "or-d3",
          prompt: "A palavra 'reivindicar' tem a letra N antes do V ('reinvidicar')?",
          options: ["Errado (é 'reivindicar', N vem depois do V)", "Certo"],
          correctIndex: 0,
          explanation: "A pronúncia e escrita corretas são 'rei-vin-di-car'.",
        },
      ],
    },
  },
  {
    id: "port-acentuacao",
    title: "Acentuação Express",
    subject: "portugues",
    type: "multiple-choice",
    description: "Domine oxítonas, paroxítonas e proparoxítonas sem pestanejar.",
    rules:
      "Selecione a opção em que todas as palavras obedecem às regras do Acordo Ortográfico vigente.",
    iconName: "Feather",
    estimatedMinutes: 2,
    questions: {
      facil: [
        {
          id: "ac-f1",
          prompt: "Toda palavra proparoxítona é acentuada?",
          options: [
            "Sim, sem exceção",
            "Não, apenas as terminadas em A, E, O",
            "Depende do contexto",
          ],
          correctIndex: 0,
          explanation: "Na língua portuguesa, 100% das proparoxítonas são acentuadas.",
        },
        {
          id: "ac-f2",
          prompt: "Qual destas palavras oxítonas deve obrigatoriamente ser acentuada?",
          options: ["Café", "Abacaxi", "Caju", "Tambor"],
          correctIndex: 0,
          explanation:
            "Oxítonas terminadas em A, E, O (seguidas ou não de S), EM, ENS são acentuadas.",
        },
        {
          id: "ac-f3",
          prompt: "Qual destas palavras paroxítonas é acentuada?",
          options: ["Táxi", "Mesa", "Livro", "Porta"],
          correctIndex: 0,
          explanation: "Paroxítonas terminadas em I(s), US, R, X, N, L são acentuadas.",
        },
      ],
      medio: [
        {
          id: "ac-m1",
          prompt: "Após o Novo Acordo Ortográfico, a palavra 'ideia' tem acento?",
          options: ["Não tem acento (ditongo aberto em paroxítona)", "Tem acento (idéia)"],
          correctIndex: 0,
          explanation:
            "Ditongos abertos EI e OI em palavras paroxítonas perderam o acento (ideia, jiboia, heroico).",
        },
        {
          id: "ac-m2",
          prompt: "Qual palavra mantém o acento por ser proparoxítona?",
          options: ["Lâmpada", "Saude", "Porem", "Hifen"],
          correctIndex: 0,
          explanation: "'Lâm-pa-da' é proparoxítona e leva circunflexo.",
        },
        {
          id: "ac-m3",
          prompt: "A palavra 'vôo' ainda possui acento circunflexo?",
          options: ["Não, virou 'voo'", "Sim, continua com acento"],
          correctIndex: 0,
          explanation: "O hiato OO perdeu o acento (voo, enjoo, perdoo).",
        },
      ],
      dificil: [
        {
          id: "ac-d1",
          prompt: "Qual é o plural correto e acentuado de 'hífen'?",
          options: ["Hifens (sem acento)", "Hífens (com acento)", "Hífenes"],
          correctIndex: 0,
          explanation: "Paroxítona terminada em -ens não leva acento (hifens, polens, jovens).",
        },
        {
          id: "ac-d2",
          prompt: "O verbo 'ter' na 3ª pessoa do plural do presente leva acento diferencial?",
          options: ["Sim: 'eles têm'", "Não: 'eles tem'"],
          correctIndex: 0,
          explanation: "Ele tem (singular) / Eles têm (plural com circunflexo).",
        },
        {
          id: "ac-d3",
          prompt: "A palavra 'bainha' leva acento no I do hiato?",
          options: ["Não, porque é seguido de NH", "Sim, todo hiato em I é acentuado"],
          correctIndex: 0,
          explanation:
            "Hiatos em I seguidos de NH na sílaba seguinte não levam acento (bainha, rainha).",
        },
      ],
    },
  },
  {
    id: "port-crase",
    title: "Desafio da Crase",
    subject: "portugues",
    type: "multiple-choice",
    description: "Nunca mais erre o acento grave antes de substantivos e locuções.",
    rules:
      "A crase é a fusão da preposição 'a' com o artigo feminino 'a'. Escolha a opção correta para a frase apresentada.",
    iconName: "Sparkles",
    estimatedMinutes: 2,
    questions: {
      facil: [
        {
          id: "cr-f1",
          prompt: "'Vou ___ praia amanhã.' Qual a forma correta?",
          options: ["à praia", "a praia", "há praia"],
          correctIndex: 0,
          explanation: "Quem vai, vai A algum lugar + A praia = à praia.",
        },
        {
          id: "cr-f2",
          prompt: "'Fiz o trabalho ___ mão.' Qual a forma correta?",
          options: ["à mão (locução adverbial feminina)", "a mão", "há mão"],
          correctIndex: 0,
          explanation: "Locuções adverbiais, prepositivas e conjuntivas femininas levam crase.",
        },
        {
          id: "cr-f3",
          prompt: "'Ele andou ___ cavalo.' Há crase antes de palavra masculina?",
          options: ["Não, o correto é 'a cavalo'", "Sim, o correto é 'à cavalo'"],
          correctIndex: 0,
          explanation: "Nunca ocorre crase antes de palavras masculinas.",
        },
      ],
      medio: [
        {
          id: "cr-m1",
          prompt: "'Enviei a mensagem ___ ela.' Ocorre crase antes de pronomes pessoais?",
          options: ["Não, o correto é 'a ela'", "Sim, o correto é 'à ela'"],
          correctIndex: 0,
          explanation: "Não há artigo feminino antes de pronomes pessoais retos ou oblíquos.",
        },
        {
          id: "cr-m2",
          prompt: "'Chegamos ___ 20 horas pontualmente.' Ocorre crase antes de horas exatas?",
          options: ["Sim: 'às 20 horas'", "Não: 'as 20 horas'"],
          correctIndex: 0,
          explanation: "Antes de indicação de horas determinadas ocorre crase.",
        },
        {
          id: "cr-m3",
          prompt: "'Fui ___ Roma dos césares.' Ocorre crase com nome de cidade modificado?",
          options: [
            "Sim, pois Roma está especificada: 'à Roma dos césares'",
            "Não, nome de cidade nunca tem crase",
          ],
          correctIndex: 0,
          explanation: "Cidades não levam crase ('volto de Roma'), exceto quando especificadas.",
        },
      ],
      dificil: [
        {
          id: "cr-d1",
          prompt: "'O aluno começou ___ estudar cedo.' Ocorre crase antes de verbos?",
          options: [
            "Nunca ocorre crase antes de verbo: 'a estudar'",
            "Sim, ocorre crase: 'à estudar'",
          ],
          correctIndex: 0,
          explanation: "Antes de verbos no infinitivo nunca ocorre crase.",
        },
        {
          id: "cr-d2",
          prompt:
            "'Entregue o livro ___ diretora ou ___ sua assistente.' O uso antes de pronome possessivo feminino singular é:",
          options: [
            "Obrigatório no primeiro e facultativo no segundo",
            "Obrigatório em ambos",
            "Facultativo em ambos",
          ],
          correctIndex: 0,
          explanation:
            "Antes de 'diretora' é obrigatório (à); antes de possessivo feminino singular (sua) o artigo é facultativo (a ou à).",
        },
        {
          id: "cr-d3",
          prompt: "'Fiz um bife ___ milanesa.' Ocorre crase na expressão elíptica 'à moda de'?",
          options: ["Sim: 'à milanesa' (à moda milanesa)", "Não: 'a milanesa'"],
          correctIndex: 0,
          explanation:
            "Mesmo que 'moda de' esteja oculto, ocorre crase ('bife à milanesa', 'gol à Pelé').",
        },
      ],
    },
  },
];

export const GAMES_CATALOG: GameDefinition[] = [
  ...LEGACY_GAMES.map((game) =>
    game.id === MAP_GAME.id
      ? MAP_GAME
      : game.id === FLAGS_GAME.id
        ? FLAGS_GAME
        : game.id === "geo-capitais"
          ? { ...game, timeLimitSeconds: 60 }
          : game.id === "math-tabuada"
            ? {
                ...game,
                title: "Sobrevivência: equações e frações",
                description: "Resolva equações e frações antes de a reserva de tempo acabar.",
                rules:
                  "Você começa com 45 segundos. Cada acerto recupera três segundos, até a reserva máxima; erros tiram dois. Resolva equações e frações para manter seu combo.",
              }
            : game.id === "math-calc-mental"
              ? {
                  ...game,
                  rules:
                    "Resolva contas por regras, sem decorar a ordem. Cada acerto recupera três segundos e aumenta o combo; erros tiram dois segundos.",
                }
              : game,
  ),
  ...EXTRA_GAMES,
];

export function getGamesBySubject(subject?: string): GameDefinition[] {
  if (!subject || subject === "todos") return GAMES_CATALOG;
  return GAMES_CATALOG.filter((game) => game.subject === subject);
}

export function getGameById(id: string): GameDefinition | undefined {
  return GAMES_CATALOG.find((game) => game.id === id);
}
