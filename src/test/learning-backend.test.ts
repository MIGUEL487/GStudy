import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  aiObject: vi.fn(),
  aiText: vi.fn(),
  from: vi.fn(),
  filter: vi.fn(),
  rpc: vi.fn(),
  rows: [] as { id: string; title: string; memory: string }[],
}));
vi.mock('@/lib/ai.server', () => ({ aiObject: mocks.aiObject, aiText: mocks.aiText }));
vi.mock('@/lib/study-auth-middleware', () => ({ requireStudyAuth: {} }));
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    let parse: (input: unknown) => unknown = (input) => input;
    const builder = {
      middleware: () => builder,
      validator: (validator: (input: unknown) => unknown) => {
        parse = validator;
        return builder;
      },
      inputValidator: (validator: (input: unknown) => unknown) => {
        parse = validator;
        return builder;
      },
      handler: (handler: (input: unknown) => Promise<unknown>) => async ({ data }: { data: unknown }) =>
        handler({
          data: parse(data),
          context: {
            supabase: { from: mocks.from, rpc: mocks.rpc },
            userId: 'test-user',
          },
        }),
    };
    return builder;
  },
}));

import { feynmanReply, generateActivity } from '@/lib/learn.functions';
import { createLearningPath, generateRecallMaterial, generateReviewChallenge, gradeRecall, gradeReview } from '@/lib/learning.functions';
import { cleanLearningText } from '@/lib/learning-ai';

const context = { subject: 'Matemática', topic: 'Teorema de Pitágoras', goal: 'Relacionar as áreas dos quadrados dos lados.' };
const materialId = '11111111-1111-4111-8111-111111111111';
const board = 'data:image/jpeg;base64,YWJj';
const call = (fn: unknown, data: unknown) => (fn as (input: { data: unknown }) => Promise<unknown>)({ data });
const cards = () => ({ cards: Array.from({ length: 10 }, (_, index) => ({ front: `Pergunta ${index + 1}?`, back: 'Uma explicação correta.' })) });
const quiz = () => ({ questions: Array.from({ length: 6 }, (_, index) => ({ question: `Qual é o resultado ${index + 1}?`, options: ['Um', 'Dois', 'Três', 'Quatro'], answer: 0, why: 'O raciocínio está correto.' })) });
const grade = () => ({ score: 8, feedback: 'Você conectou as áreas dos quadrados.', strengths: ['Relação entre os lados.'], gaps: ['Justificar a condição de ângulo reto.'], modelAnswer: 'Num triângulo retângulo, a área do quadrado da hipotenusa é a soma das áreas dos quadrados dos catetos.' });

beforeEach(() => {
  vi.clearAllMocks(); mocks.rows = [];
  mocks.rpc.mockResolvedValue({ data: { allowed: true, count: 1, limit: 10, remaining: 9 }, error: null });
  const query = {
    select: () => query, order: () => query, limit: () => query, eq: () => query, maybeSingle: () => Promise.resolve({ data: { count: 0 }, error: null }),
    in: (...args: unknown[]) => { mocks.filter(...args); return query; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: mocks.rows, error: null }).then(resolve),
  };
  mocks.from.mockReturnValue(query);
});

describe('Contexto e qualidade das atividades', () => {
  it('gera pelo assunto sem importar silenciosamente materiais de outras matérias', async () => {
    mocks.aiObject.mockResolvedValue(cards());
    const result = await call(generateActivity, { mode: 'flashcards', ids: [], context: { ...context, notes: 'Minha anotação: hipotenusa oposta ao ângulo reto.' } });
    expect(result).toEqual({ mode: 'flashcards', cards: cards() });
    const [instructions, messages] = mocks.aiObject.mock.calls[0]!;
    expect(instructions).toContain('acentos'); expect(instructions).toContain('sem Markdown');
    expect(messages[0].content).toContain('Matemática'); expect(messages[0].content).toContain('Minha anotação');
  });

  it('usa somente os materiais selecionados e inclui suas notas no contexto da IA', async () => {
    mocks.rows = [{ id: materialId, title: 'Página importada do Notion', memory: 'As áreas se somam.' }];
    mocks.aiObject.mockResolvedValue(cards());
    await call(generateActivity, { mode: 'flashcards', ids: [materialId], context });
    expect(mocks.filter).toHaveBeenCalledWith('id', [materialId]);
    expect(mocks.aiObject.mock.calls[0]![1][0].content).toContain('Página importada do Notion\nAs áreas se somam.');
  });

  it('avisa quando uma fonte selecionada foi removida em vez de inventar seu conteúdo', async () => {
    await expect(call(generateActivity, { mode: 'flashcards', ids: [materialId], context })).rejects.toThrow('não está mais disponível');
    expect(mocks.aiObject).not.toHaveBeenCalled();
  });

  it('repara acentuação serializada, entidades e mojibake sem retirar símbolos matemáticos', async () => {
    expect(cleanLearningText('```text\nOpera&ccedil;&otilde;es: adi\\u00e7\\u00e3o, subtraÃ§Ã£o e cÂ².\\n3 &times; 2 = 6\n```')).toBe('Operações: adição, subtração e c².\n3 × 2 = 6');
    const deck = cards(); deck.cards[0] = { front: 'O que &eacute; adi\\u00e7\\u00e3o?', back: 'Uma operaÃ§Ã£o matemÃ¡tica.' };
    mocks.aiObject.mockResolvedValue(deck);
    const result = await call(generateActivity, { mode: 'flashcards', ids: [], context }) as { cards: { cards: { front: string; back: string }[] } };
    expect(result.cards.cards[0]).toEqual({ front: 'O que é adição?', back: 'Uma operação matemática.' });
  });

  it('rejeita índice incorreto e opções duplicadas sem mudar a resposta silenciosamente', async () => {
    const invalid = quiz(); invalid.questions[0]!.answer = 4;
    mocks.aiObject.mockResolvedValue(invalid);
    await expect(call(generateActivity, { mode: 'quiz', ids: [], context })).rejects.toThrow('inconsistente');
    const repeated = quiz(); repeated.questions[0]!.options[1] = 'Um';
    mocks.aiObject.mockResolvedValue(repeated);
    await expect(call(generateActivity, { mode: 'quiz', ids: [], context })).rejects.toThrow('inconsistente');
  });

  it('não entrega baralhos vazios nem quizzes incompletos como concluídos', async () => {
    mocks.aiObject.mockResolvedValue({ cards: [] });
    await expect(call(generateActivity, { mode: 'flashcards', ids: [], context })).rejects.toThrow('incompleta');
    mocks.aiObject.mockResolvedValue({ questions: quiz().questions.slice(0, 2) });
    await expect(call(generateActivity, { mode: 'quiz', ids: [], context })).rejects.toThrow('incompleta');
  });
});

describe('Trilhas, recordação ativa e revisão final', () => {
  it('cria etapas em ordem de pré-requisitos com objetivo e desafio por etapa', async () => {
    const path = { overview: 'Vamos compreender a relação entre lados e áreas.', topics: ['Triângulos retângulos', 'Áreas dos quadrados', 'Aplicações'].map(title => ({ title, goal: `Compreender ${title}.`, challenge: `Explique por que ${title} ajuda no raciocínio.` })) };
    mocks.aiObject.mockResolvedValue(path);
    expect(await call(createLearningPath, { subject: context.subject, topic: context.topic, ids: [], notes: '' })).toEqual(path);
    expect(mocks.aiObject.mock.calls[0]![0]).toContain('ordem de pré-requisitos');
    mocks.aiObject.mockResolvedValue({ ...path, topics: [path.topics[0], path.topics[0], path.topics[2]] });
    await expect(call(createLearningPath, { subject: context.subject, topic: context.topic, ids: [], notes: '' })).rejects.toThrow('inconsistente');
  });

  it('produz material autossuficiente de estudo e rejeita avaliação fora de 0 a 10', async () => {
    const material = { title: 'Áreas e lados', content: 'Um triângulo retângulo tem um ângulo de 90°. '.repeat(10).trim(), keyPoints: ['Ângulo reto', 'Catetos', 'Hipotenusa'] };
    mocks.aiObject.mockResolvedValue(material);
    expect(await call(generateRecallMaterial, { context, ids: [] })).toEqual(material);
    mocks.aiObject.mockResolvedValue({ ...grade(), score: 11 });
    await expect(call(gradeRecall, { context, ids: [], source: material.content, answer: 'Os quadrados dos catetos têm áreas que se somam.' })).rejects.toThrow('inconsistente');
  });

  it('avalia recordação por conceitos e usa o texto realmente estudado como referência', async () => {
    mocks.aiObject.mockResolvedValue(grade());
    const source = 'Num triângulo retângulo, o quadrado da hipotenusa tem área igual à soma das áreas dos quadrados dos catetos.';
    const answer = 'A área maior soma as duas menores.';
    expect(await call(gradeRecall, { context, ids: [], source, answer })).toEqual(grade());
    expect(mocks.aiObject.mock.calls[0]![1][0].content).toContain(JSON.stringify({ textoEstudado: source, recordacaoDoEstudante: answer }));
    expect(mocks.aiObject.mock.calls[0]![0]).toContain('não exija copiar palavras');
  });

  it('separa desafio e dica da solução e aceita uma revisão desenhada sem texto', async () => {
    const challenge = { prompt: 'Por que a área do quadrado da hipotenusa corresponde à soma das outras duas?', hint: 'Comece marcando o ângulo reto e desenhando os quadrados.' };
    mocks.aiObject.mockResolvedValue(challenge);
    expect(await call(generateReviewChallenge, { context, ids: [] })).toEqual(challenge);
    mocks.aiObject.mockResolvedValue(grade());
    await expect(call(gradeReview, { context, ids: [], answer: '', board, challenge: challenge.prompt })).resolves.toEqual(grade());
    expect(mocks.aiObject.mock.calls[1]![1][0].content).toContainEqual({ type: 'image', image: board });
  });

  it('não chama IA para resposta vazia ou URL de imagem arbitrária', async () => {
    await expect(call(gradeReview, { context, ids: [], answer: '', challenge: 'Explique o raciocínio.' })).rejects.toThrow();
    await expect(call(gradeReview, { context, ids: [], answer: 'Uma explicação.', board: 'https://internal/image.jpg', challenge: 'Explique o raciocínio.' })).rejects.toThrow();
    expect(mocks.aiObject).not.toHaveBeenCalled();
  });
});

describe('Alunos do Método Feynman', () => {
  it('mantém a personalidade escolhida e envia somente o desenho mais recente', async () => {
    mocks.aiText.mockResolvedValue('Sou a Lia. Por que essas áreas se somam?');
    const secondBoard = 'data:image/png;base64,ZGVm';
    await call(feynmanReply, { topic: context.topic, context, ids: [], studentId: 'lia', messages: [
      { role: 'user', text: 'Primeiro desenho', board }, { role: 'assistant', text: 'Pode explicar melhor?' }, { role: 'user', text: 'Veja as áreas', board: secondBoard },
    ] });
    const [instructions, messages, hasBoard] = mocks.aiText.mock.calls[0]!;
    expect(instructions).toContain('Você é Lia'); expect(instructions).toContain('pergunta por que');
    expect(JSON.stringify(messages)).not.toContain(board);
    expect(messages[2].content).toContainEqual({ type: 'image', image: secondBoard });
    expect(hasBoard).toBe(true);
  });
});
