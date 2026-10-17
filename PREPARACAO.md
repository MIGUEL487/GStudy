# Rumo à prova

A área `/preparar` é um espaço próprio para provas da escola, concursos/vestibulares e olimpíadas. **Aprender** (`/aprender`) mantém as trilhas de seis atividades; os planos de Rumo à prova não aparecem na lista nem na contagem dessas trilhas. Links antigos `/aprender?p=<preparação>` encaminham para `/preparar?p=<plano>`.

## Do objetivo ao roteiro

A conversa inicial usa etapa escolar, tipo de desafio, nome e edição/nível/cargo. Concursos e olimpíadas seguem direto para a pesquisa do programa completo, sem impor uma matéria única. Para provas escolares, a IA reconhece o conteúdo no nome ou no campo opcional; só solicita uma matéria quando o conteúdo não estiver identificado. Para concursos e olimpíadas, Gemini pode pesquisar o programa oficial e referências públicas; para provas da escola, pede o roteiro do professor, sem pesquisar materiais privados. Sem fontes de busca, a orientação é identificada como geral e o programa precisa ser confirmado.

O diagnóstico pergunta conhecimentos prévios, dificuldades e escopo, sem repetir tempo, nota/meta ou data. Depois das respostas, a pessoa escolhe sua meta no círculo em passos de **5%**, uma data opcional e o tempo disponível por dia (15 a 180 minutos). Tempo e porcentagem informados espontaneamente na resposta são reaproveitados nos campos editáveis. Pode fornecer roteiro, edital, cadernos — inclusive do Notion — e materiais selecionados. Somente esses materiais entram na memória da geração; anotações e respostas não viram consultas da pesquisa pública.

A IA gera um programa de tópicos, estratégia, ritmo, de 3 a 12 sessões e de 2 a 8 recomendações de vídeos e livros. As sessões têm ações de assistir/anotar, ler/conectar, resolver/investigar e revisar erros, com duração estimada e um resultado concreto para registrar no caderno. O roteiro de sessões continua distinto das trilhas de Aprender; o plano oferece apenas questões e flashcards como prática complementar. A duração estimada da sessão respeita o tempo diário; não é uma duração atribuída ao vídeo. Todos os tópicos precisam ter sessões correspondentes.

## Painel próprio

- **Meu roteiro:** próximo passo, tarefas, tempo estimado, resultado esperado no caderno e sessões concluídas. A pessoa marca o estudo que realmente realizou, sem geração de notas ou XP fictícios.
- **Vídeos & livros:** player oficial do YouTube com canal, avatar e trechos definidos por capítulos publicados; biblioteca gratuita com licença comercial verificada na própria obra; e livros comerciais na Amazon Brasil. Sem metadados suficientes, o site identifica as buscas e não inventa vídeos, horários, logos ou permissões. Veja [BIBLIOTECA-DE-ESTUDOS.md](./BIBLIOTECA-DE-ESTUDOS.md) para a configuração de `YOUTUBE_API_KEY` e as regras de direitos.
- **Questões & flashcards:** duas práticas por tópico, sem exigir as outras quatro atividades. Usam as mesmas duas tentativas diárias por tipo de Aprender: trocar plano ou área não reinicia o limite. Reservas que falham na geração são liberadas. O teste recolhe a navegação e volta ao plano correto; cartas podem levar às questões do mesmo tópico. As questões são geradas pela IA e não são apresentadas como questões oficiais da banca.
- **Mapa da prova:** tópicos, objetivos, desafios de compreensão e contexto/fontes da pesquisa. Meta de acertos e conclusão de sessões não são previsão de nota nem garantia de aprovação.

Os links de recursos não são URLs arbitrárias devolvidas pela IA. Vídeos passam pelos metadados oficiais e o player respeita bloqueios de incorporação. PDFs exigem licença da própria obra e atribuição na fonte oficial; livros comerciais abrem a Amazon. O conteúdo da referência não é apresentado como lido pelo aplicativo apenas por ter sido recomendado.

## Dados e compatibilidade

Os planos continuam no documento de conta `learning`, com `preparation.guide` e `dailyMinutes` opcionais para aceitar contas antigas. Sessões usam chaves `preparation:mission:<índice>` no registro de conclusões, separadas das atividades das trilhas. A cópia por conta no navegador e a sincronização por revisão do Supabase continuam funcionando; não há nova migração SQL.

Planos antigos ficam visíveis em Rumo à prova e oferecem **Descobrir meu novo roteiro**. A atualização mantém o ID, tópicos, materiais, anotações e conclusões anteriores; salva apenas o novo guia sobre a versão mais recente do plano. Se outra aba ou aparelho já adicionou um guia, ele é preservado. Uma falha de armazenamento permite tentar salvar a geração pronta sem gastar outra chamada de IA.

## Provedores e validação

A ordem continua Gemini (`BOARD_AI_*`) → Groq (`GROQ_API_KEY`) → OpenRouter gratuito (`OPENROUTER_API_KEY`) nas falhas técnicas. As alternativas não fazem pesquisa web neste fluxo e não retornam fontes inventadas. Aprender e Rumo à prova compartilham o contador existente de questões e flashcards. Marcar uma sessão do roteiro não consome tentativas. O contador é um limite da interface no navegador com sincronização eventual por conta; não é uma proteção contra abuso implementada no servidor.

Testes automatizados cobrem geração, tempo diário, referências, preservação de planos antigos, progresso, mescla entre aparelhos e separação de listas/destinos. A validação no navegador usa conta e respostas simuladas, incluindo criação, atualização, retomada após recarregar, biblioteca e telas de computador/celular. Chamadas reais de IA e sincronização em contas reais dependem das credenciais da hospedagem.

Nesta atualização, 335 testes passaram, junto com TypeScript e build Vercel. A jornada foi conferida em 1512 px e 390 px, sem erros de JavaScript nem rolagem horizontal, com autenticação, sincronização e IA simuladas.
