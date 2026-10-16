# Rumo à prova

A área `/preparar` é um espaço próprio para provas da escola, concursos/vestibulares e olimpíadas. **Aprender** (`/aprender`) mantém as trilhas de seis atividades; os planos de Rumo à prova não aparecem na lista nem na contagem dessas trilhas. Links antigos `/aprender?p=<preparação>` encaminham para `/preparar?p=<plano>`.

## Do objetivo ao roteiro

A conversa inicial usa etapa escolar, tipo de desafio, nome, edição/nível/cargo, matéria e foco. Para concursos e olimpíadas, Gemini pode pesquisar o programa oficial e referências públicas; para provas da escola, pede o roteiro do professor, sem pesquisar materiais privados. Sem fontes de busca, a orientação é identificada como geral e o programa precisa ser confirmado.

Depois das respostas, a pessoa escolhe sua meta de acertos no círculo, uma data opcional e o tempo disponível por dia (15 a 180 minutos). Pode fornecer roteiro, edital, cadernos — inclusive do Notion — e materiais selecionados. Somente esses materiais entram na memória da geração; anotações e respostas não viram consultas da pesquisa pública.

A IA gera um programa de tópicos, estratégia, ritmo, de 3 a 12 sessões e de 2 a 8 recomendações de vídeos e livros. As sessões têm ações de assistir/anotar, ler/conectar, resolver/investigar e revisar erros, com duração estimada e um resultado concreto para registrar no caderno. Não são uma segunda cópia de flashcards, quizzes ou Feynman. A duração estimada da sessão respeita o tempo diário; não é uma duração atribuída ao vídeo. Todos os tópicos precisam ter sessões correspondentes.

## Painel próprio

- **Meu roteiro:** próximo passo, tarefas, tempo estimado, resultado esperado no caderno e sessões concluídas. A pessoa marca o estudo que realmente realizou, sem geração de notas ou XP fictícios.
- **Vídeos & livros:** player oficial do YouTube com canal, avatar e trechos definidos por capítulos publicados; biblioteca gratuita com licença comercial verificada na própria obra; e livros comerciais na Amazon Brasil. Sem metadados suficientes, o site identifica as buscas e não inventa vídeos, horários, logos ou permissões. Veja [BIBLIOTECA-DE-ESTUDOS.md](./BIBLIOTECA-DE-ESTUDOS.md) para a configuração de `YOUTUBE_API_KEY` e as regras de direitos.
- **Mapa da prova:** tópicos, objetivos, desafios de compreensão e contexto/fontes da pesquisa. Meta de acertos e conclusão de sessões não são previsão de nota nem garantia de aprovação.

Os links de recursos não são URLs arbitrárias devolvidas pela IA. Vídeos passam pelos metadados oficiais e o player respeita bloqueios de incorporação. PDFs exigem licença da própria obra e atribuição na fonte oficial; livros comerciais abrem a Amazon. O conteúdo da referência não é apresentado como lido pelo aplicativo apenas por ter sido recomendado.

## Dados e compatibilidade

Os planos continuam no documento de conta `learning`, com `preparation.guide` e `dailyMinutes` opcionais para aceitar contas antigas. Sessões usam chaves `preparation:mission:<índice>` no registro de conclusões, separadas das atividades das trilhas. A cópia por conta no navegador e a sincronização por revisão do Supabase continuam funcionando; não há nova migração SQL.

Planos antigos ficam visíveis em Rumo à prova e oferecem **Descobrir meu novo roteiro**. A atualização mantém o ID, tópicos, materiais, anotações e conclusões anteriores; salva apenas o novo guia sobre a versão mais recente do plano. Se outra aba ou aparelho já adicionou um guia, ele é preservado. Uma falha de armazenamento permite tentar salvar a geração pronta sem gastar outra chamada de IA.

## Provedores e validação

A ordem continua Gemini (`BOARD_AI_*`) → Groq (`GROQ_API_KEY`) → OpenRouter gratuito (`OPENROUTER_API_KEY`) nas falhas técnicas. As alternativas não fazem pesquisa web neste fluxo e não retornam fontes inventadas. Os testes das atividades de Aprender mantêm seus limites diários; marcar uma sessão do roteiro não inicia um teste nem consome uma tentativa de quiz.

Testes automatizados cobrem geração, tempo diário, referências, preservação de planos antigos, progresso, mescla entre aparelhos e separação de listas/destinos. A validação no navegador usa conta e respostas simuladas, incluindo criação, atualização, retomada após recarregar, biblioteca e telas de computador/celular. Chamadas reais de IA e sincronização em contas reais dependem das credenciais da hospedagem.

Nesta atualização, 257 testes passaram, junto com TypeScript e build Vercel. A jornada foi conferida em 1512 px e 390 px, sem erros de JavaScript nem rolagem horizontal, com autenticação, sincronização e IA simuladas.
