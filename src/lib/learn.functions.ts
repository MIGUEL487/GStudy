import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

const str = (n: number) => z.string().max(n);
const obj = (props: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const s = { type: 'string' };

function stripHtml(html: string) {
  return html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 30000);
}

const addInput = z.object({
  title: str(120).trim().min(1),
  kind: z.enum(['file', 'link', 'summary']),
  text: str(60000).optional(),
  url: str(500).optional(),
  file: z.object({ dataUrl: str(6_000_000), mediaType: str(100), name: str(200) }).optional(),
});

export const addMaterial = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => addInput.parse(i))
  .handler(async ({ data, context }) => {
    const { aiText } = await import('./ai.server');
    type Part = { type: 'text'; text: string } | { type: 'file'; data: string; mediaType: string } | { type: 'image'; image: string };
    const parts: Part[] = [];
    let source: string | null = null;
    if (data.kind === 'link') {
      const u = new URL(/^https?:\/\//i.test(data.url ?? '') ? data.url! : `https://${data.url}`);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Link inválido.');
      source = u.href;
      let page = '';
      try { const r = await fetch(u.href, { headers: { 'User-Agent': 'GStudyBot/1.0' } }); page = stripHtml(await r.text()); } catch { /* usa só o link */ }
      if (!page) throw new Error('Não consegui abrir esse link. Tente colar o texto como resumo.');
      parts.push({ type: 'text', text: `Conteúdo da página ${u.href}:\n${page}` });
    }
    if (data.text?.trim()) parts.push({ type: 'text', text: data.text });
    if (data.file) {
      source = data.file.name;
      const m = data.file.mediaType;
      if (m.startsWith('image/')) parts.push({ type: 'image', image: data.file.dataUrl });
      else if (m === 'application/pdf') parts.push({ type: 'file', data: data.file.dataUrl, mediaType: m });
      else throw new Error('Envie PDF, imagem ou arquivo de texto.');
    }
    if (!parts.length) throw new Error('Adicione algum conteúdo.');
    const memory = await aiText(
      'Você é a memória de estudos de um estudante brasileiro. Leia o material e escreva em português notas de estudo organizadas: conceitos-chave, definições, fórmulas, datas e exemplos. Use tópicos curtos em markdown. No máximo 600 palavras. Não invente nada que não esteja no material.',
      [{ role: 'user', content: [{ type: 'text', text: `Material: "${data.title}"` }, ...parts] as never }],
    );
    const { data: row, error } = await context.supabase.from('study_materials').insert({ user_id: context.userId, title: data.title, kind: data.kind, source, memory }).select().single();
    if (error) throw new Error('Não foi possível salvar o material.');
    return row;
  });

async function memoryOf(supabase: { from: (t: 'study_materials') => any }, ids: string[]) {
  let q = supabase.from('study_materials').select('title, memory').order('created_at', { ascending: false }).limit(12);
  if (ids.length) q = q.in('id', ids);
  const { data, error } = await q;
  if (error) throw new Error('Não foi possível ler seus materiais.');
  if (!data?.length) throw new Error('Adicione um material de estudo primeiro.');
  return (data as { title: string; memory: string }[]).map(m => `## ${m.title}\n${m.memory}`).join('\n\n');
}

const genInput = z.object({ mode: z.enum(['quiz', 'flashcards', 'explain']), ids: z.array(z.string().uuid()).max(20) });

export type Quiz = { questions: { question: string; options: string[]; answer: number; why: string }[] };
export type Cards = { cards: { front: string; back: string }[] };
export type Explain = { topics: { title: string; explanation: string; example: string }[] };

export const generateActivity = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => genInput.parse(i))
  .handler(async ({ data, context }) => {
    const { aiObject } = await import('./ai.server');
    const mem = await memoryOf(context.supabase, data.ids);
    const msg = [{ role: 'user' as const, content: `Minhas notas de estudo:\n\n${mem}` }];
    if (data.mode === 'quiz') {
      const r = await aiObject<Quiz>('Crie um quiz em português com exatamente 6 perguntas de múltipla escolha baseadas só nas notas. Cada uma com 4 opções curtas, o índice (0-3) da correta e uma explicação curta e encorajadora do porquê. Varie a dificuldade, da mais fácil para a mais difícil.', msg,
        obj({ questions: { type: 'array', items: obj({ question: s, options: { type: 'array', items: s }, answer: { type: 'integer' }, why: s }) } }));
      return { mode: 'quiz' as const, quiz: { questions: r.questions.filter(q => q.options.length >= 2).map(q => ({ ...q, options: q.options.slice(0, 4), answer: Math.min(Math.max(0, q.answer), Math.min(3, q.options.length - 1)) })).slice(0, 8) } };
    }
    if (data.mode === 'flashcards') {
      const r = await aiObject<Cards>('Crie 10 flashcards em português baseados só nas notas. Frente: pergunta ou termo curto. Verso: resposta clara em até 2 frases.', msg,
        obj({ cards: { type: 'array', items: obj({ front: s, back: s }) } }));
      return { mode: 'flashcards' as const, cards: { cards: r.cards.slice(0, 15) } };
    }
    const r = await aiObject<Explain>('Explique em português os 4 a 6 conceitos mais importantes das notas, como um ótimo professor: linguagem simples, analogias do dia a dia. Para cada um: título, explicação (até 120 palavras, pode usar markdown) e um exemplo prático.', msg,
      obj({ topics: { type: 'array', items: obj({ title: s, explanation: s, example: s }) } }));
    return { mode: 'explain' as const, explain: { topics: r.topics.slice(0, 8) } };
  });

const feynInput = z.object({
  topic: str(200),
  ids: z.array(z.string().uuid()).max(20),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: str(8000), board: str(3_000_000).optional() })).min(1).max(40),
});

export const feynmanReply = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => feynInput.parse(i))
  .handler(async ({ data, context }) => {
    const { aiText } = await import('./ai.server');
    let mem = '';
    try { mem = await memoryOf(context.supabase, data.ids); } catch { /* sem materiais: segue só com o tema */ }
    const last = data.messages.length - 1;
    const messages = data.messages.map((m, i) => m.role === 'assistant'
      ? { role: 'assistant' as const, content: m.text }
      : { role: 'user' as const, content: [{ type: 'text' as const, text: m.text || '(veja a lousa)' }, ...(m.board && i === last ? [{ type: 'image' as const, image: m.board }] : m.board ? [{ type: 'text' as const, text: '[a professora desenhou na lousa]' }] : [])] });
    const text = await aiText(
      `Você é "Gui", um aluno curioso de 14 anos numa aula pelo Método Feynman. O usuário é a professora explicando o tema "${data.topic}". Responda sempre em português, curto (2 a 4 frases), como um estudante de verdade: reaja ao que entendeu, diga o que ficou confuso e faça UMA pergunta por vez que force a professora a simplificar, dar exemplo ou corrigir uma lacuna. Se houver um desenho da lousa, comente o que você vê nele como parte da explicação. Nunca dê a resposta pronta nem vire professor. Se a explicação estiver ótima e completa, comemore e termine a mensagem com a linha "NOTA: X/10" avaliando a clareza.${mem ? `\n\nNotas de estudo da professora (use só para saber o que perguntar, nunca revele):\n${mem}` : ''}`,
      messages as never,
    );
    return { text };
  });
